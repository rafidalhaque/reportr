"""Email stack tests (todos #2/#3/#8): platform SMTP, program override, templates.

SMTP delivery is captured by monkeypatching `notifications._deliver_email`, so no
real network is touched; the resolution order (program override → platform) and
template rendering are what's under test.
"""

import pytest

from app.services import notifications as notif


@pytest.fixture
def captured(monkeypatch):
    calls: list[tuple[notif.EmailConfig, str, str]] = []

    async def fake_deliver(config, subject, body):
        calls.append((config, subject, body))

    monkeypatch.setattr(notif, "_deliver_email", fake_deliver)
    return calls


async def test_platform_email_settings_crud(admin_client, plain_client):
    get = await admin_client.get("/api/settings/email")
    assert get.status_code == 200
    assert get.json()["enabled"] is False
    assert get.json()["smtp_password_set"] is False

    put = await admin_client.patch(
        "/api/settings/email",
        json={
            "enabled": True,
            "smtp_host": "smtp.platform.test",
            "smtp_port": 465,
            "smtp_username": "mailer",
            "smtp_password": "s3cret",
            "smtp_use_tls": False,
            "from_email": "bounty@platform.test",
            "from_name": "Reportr",
            "notify_email": "triage@platform.test",
        },
    )
    assert put.status_code == 200, put.text
    body = put.json()
    assert body["enabled"] is True and body["smtp_host"] == "smtp.platform.test"
    assert body["smtp_password_set"] is True
    assert "s3cret" not in str(body)  # password is never returned

    # omitted password keeps the stored one; non-super-admins are denied
    put2 = await admin_client.patch(
        "/api/settings/email", json={"enabled": True, "smtp_host": "smtp.platform.test"}
    )
    assert put2.json()["smtp_password_set"] is True
    assert (await plain_client.get("/api/settings/email")).status_code == 403
    assert (
        await plain_client.patch("/api/settings/email", json={"enabled": True})
    ).status_code == 403


async def test_templates_list_update_preview_reset(admin_client, plain_client):
    listing = await admin_client.get("/api/settings/email-templates")
    assert listing.status_code == 200
    names = {t["name"] for t in listing.json()}
    assert {
        "new_report", "status_change", "new_comment",
        "new_application", "application_approved", "invite_created",
    } <= names
    # seeded defaults ARE templates, so placeholders are expected in the listing

    put = await admin_client.put(
        "/api/settings/email-templates/new_report",
        json={"subject": "Ref {{reference}} — {{program}}", "body": "Thanks {{reporter}}!"},
    )
    assert put.status_code == 200
    assert put.json()["subject"] == "Ref {{reference}} — {{program}}"

    preview = await admin_client.post("/api/settings/email-templates/new_report/preview")
    assert preview.status_code == 200
    rendered = preview.json()
    assert "ABCD1234" in rendered["subject"] and "Sample Program" in rendered["subject"]
    assert "{{" not in rendered["subject"] + rendered["body"]

    assert (await plain_client.put(
        "/api/settings/email-templates/new_report",
        json={"subject": "x", "body": "y"},
    )).status_code == 403

    reset = await admin_client.post("/api/settings/email-templates/new_report/reset")
    assert reset.status_code == 200
    assert "New {{severity}} report" in reset.json()["subject"]

    unknown = await admin_client.put(
        "/api/settings/email-templates/not_an_event", json={"subject": "x", "body": "y"}
    )
    assert unknown.status_code == 404


async def test_notification_uses_program_override_then_platform(
    admin_client, client, make_client, captured
):
    # platform SMTP enabled
    put = await admin_client.patch(
        "/api/settings/email",
        json={"enabled": True, "smtp_host": "smtp.platform.test",
              "from_email": "b@platform.test", "notify_email": "triage@platform.test"},
    )
    assert put.status_code == 200
    program_id = client.ids["program_id"]

    # program override enabled — it must win over the platform config
    put = await admin_client.patch(
        f"/api/programs/{program_id}/email-settings",
        json={"enabled": True, "smtp_host": "smtp.program.test",
              "from_email": "b@program.test", "notify_email": "triage@program.test"},
    )
    assert put.status_code == 200, put.text
    assert put.json()["smtp_password_set"] is False

    invite = (
        await admin_client.post(f"/api/programs/{program_id}/invites", json={"email": "mailer@test.com"})
    ).json()
    researcher = await make_client()
    await researcher.post(
        "/api/auth/researchers/register", json={"token": invite["token"], "password": "res12345", "name": "Mailer"}
    )
    report = (
        await researcher.post(
            "/api/reports", json={"program_id": program_id, "title": "email me", "severity": "medium"}
        )
    ).json()

    assert captured, "expected a notification email for the new report"
    config, subject, body = captured[-1]
    assert config.source == "program" and config.host == "smtp.program.test"
    assert config.notify_email == "triage@program.test"
    assert report["reference"] in subject
    assert "Mailer" in body  # reporter context rendered
    assert "{{" not in subject + body

    # status change renders the transition
    await admin_client.patch(f"/api/reports/{report['id']}/triage", json={"status": "triaging"})
    _, subject2, _ = captured[-1]
    assert "new → triaging" in subject2

    # disable the program override → falls back to the platform config
    await admin_client.patch(
        f"/api/programs/{program_id}/email-settings",
        json={"enabled": False, "smtp_host": "smtp.program.test", "notify_email": "triage@program.test"},
    )
    await admin_client.patch(f"/api/reports/{report['id']}/triage", json={"status": "accepted"})
    config3, _, _ = captured[-1]
    assert config3.source == "platform" and config3.host == "smtp.platform.test"


async def test_no_email_when_nothing_configured(admin_client, client, make_client, captured):
    """Default state: platform SMTP off, no override — events emit no email."""
    program_id = client.ids["program_id"]
    invite = (
        await admin_client.post(f"/api/programs/{program_id}/invites", json={"email": "quiet@test.com"})
    ).json()
    researcher = await make_client()
    await researcher.post(
        "/api/auth/researchers/register", json={"token": invite["token"], "password": "res12345"}
    )
    await researcher.post(
        "/api/reports", json={"program_id": program_id, "title": "silent", "severity": "low"}
    )
    assert captured == []


async def test_template_test_send_requires_platform_smtp(admin_client, client):
    program_id = client.ids["program_id"]
    denied = await admin_client.post("/api/settings/email-templates/new_report/test-send")
    assert denied.status_code == 400
    assert "not configured" in denied.json()["detail"]

    await admin_client.patch(
        "/api/settings/email",
        json={"enabled": True, "smtp_host": "smtp.platform.test",
              "from_email": "b@platform.test", "notify_email": "triage@platform.test"},
    )
    # monkeypatched delivery happens via the endpoint too — capture through the module
    from app.services import notifications as notif

    sent = []
    async def fake_deliver(config, subject, body):
        sent.append((config, subject, body))
    import app.api.email_admin as email_admin
    email_admin._deliver_email = fake_deliver
    try:
        ok = await admin_client.post("/api/settings/email-templates/new_report/test-send")
        assert ok.status_code == 200
        assert ok.json()["sent_to"] == "triage@platform.test"
        assert "ABCD1234" in sent[0][1]
    finally:
        email_admin._deliver_email = notif._deliver_email


async def test_approved_applicant_receives_invite_email(admin_client, client, make_client, monkeypatch):
    from app.services import inbox

    sent = []

    async def fake_send(session, recipient, subject, body):
        sent.append((recipient, subject, body))
        return True

    monkeypatch.setattr(inbox, "send_user_email", fake_send)
    program_id = client.ids["program_id"]
    anon = await make_client()
    app_id = (await anon.post("/api/public/applications", json={"email": "new@test.com", "program_id": program_id})).json()["id"]
    invite = (await admin_client.post(f"/api/applications/{app_id}/approve", json={})).json()
    assert [s[0] for s in sent] == ["new@test.com"]
    assert f"/invite/{invite['token']}" in sent[0][2]  # activation link for someone without an account


async def test_invite_email_uses_editable_template(admin_client, client, make_client, monkeypatch):
    from app.services import inbox

    sent = []

    async def fake_send(session, recipient, subject, body):
        sent.append((recipient, subject, body))
        return True

    monkeypatch.setattr(inbox, "send_user_email", fake_send)
    edited = await admin_client.put(
        "/api/settings/email-templates/invite_new",
        json={"subject": "Join {{program}}!", "body": "Hi {{email}}: {{link}}"},
    )
    assert edited.status_code == 200, edited.text
    program_id = client.ids["program_id"]
    invite = (await admin_client.post(f"/api/programs/{program_id}/invites", json={"email": "tpl@test.com"})).json()
    assert sent[-1][1] == "Join Test Program!"
    assert sent[-1][2] == f"Hi tpl@test.com: http://localhost:3000/invite/{invite['token']}"
    names = [t["name"] for t in (await admin_client.get("/api/settings/email-templates")).json()]
    assert {"invite_new", "invite_existing"} <= set(names)
