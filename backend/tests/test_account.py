"""Account security tests (todo #14b): password change, forgot/reset, email change.

SMTP delivery is captured by monkeypatching `notifications._deliver_email`.
"""

import re

import pytest

from app.services import notifications as notif


@pytest.fixture
def mail_capture(monkeypatch):
    sent: list[tuple[str, str, str]] = []  # (recipient, subject, body)

    async def fake_send(session, recipient, subject, body):
        sent.append((recipient, subject, body))
        return True

    monkeypatch.setattr(notif, "send_user_email", fake_send)
    return sent


async def _enable_platform_smtp(admin_client):
    put = await admin_client.put(
        "/api/settings/email",
        json={
            "enabled": True,
            "smtp_host": "smtp.platform.test",
            "smtp_port": 587,
            "from_email": "b@platform.test",
            "notify_email": "triage@platform.test",
        },
    )
    assert put.status_code == 200


def _token_from(body: str) -> str:
    match = re.search(r"token=([A-Za-z0-9\-_.]+)", body)
    assert match, f"no token in email body: {body}"
    return match.group(1)


async def test_change_password_flow(admin_client, plain_client):
    bad = await plain_client.patch(
        "/api/me/password", json={"current_password": "nope", "new_password": "newpass123"}
    )
    assert bad.status_code == 400

    short = await plain_client.patch(
        "/api/me/password", json={"current_password": "plain1234", "new_password": "short"}
    )
    assert short.status_code == 422

    ok = await plain_client.patch(
        "/api/me/password", json={"current_password": "plain1234", "new_password": "newpass123"}
    )
    assert ok.status_code == 200

    old_login = await plain_client.post(
        "/api/auth/staff/login", data={"username": "plain@test.com", "password": "plain1234"}
    )
    assert old_login.status_code == 400
    new_login = await plain_client.post(
        "/api/auth/staff/login", data={"username": "plain@test.com", "password": "newpass123"}
    )
    assert new_login.status_code in (200, 204)


async def test_forgot_reset_password_researcher(admin_client, client, make_client, mail_capture):
    await _enable_platform_smtp(admin_client)
    program_id = client.ids["program_id"]
    invite = (
        await admin_client.post(f"/api/programs/{program_id}/invites", json={"email": "reset@test.com"})
    ).json()
    researcher = await make_client()
    await researcher.post(
        "/api/auth/researchers/register", json={"token": invite["token"], "password": "res12345", "name": "Reset"}
    )

    forgot = await researcher.post("/api/auth/researchers/forgot-password", json={"email": "reset@test.com"})
    assert forgot.status_code == 202
    assert mail_capture and mail_capture[-1][0] == "reset@test.com"
    assert "&kind=researchers" in mail_capture[-1][2]
    token = _token_from(mail_capture[-1][2])

    reset = await researcher.post(
        "/api/auth/researchers/reset-password", json={"token": token, "password": "brandnew123"}
    )
    assert reset.status_code == 200, reset.text

    old_login = await researcher.post(
        "/api/auth/researchers/login", data={"username": "reset@test.com", "password": "res12345"}
    )
    assert old_login.status_code == 400
    new_login = await researcher.post(
        "/api/auth/researchers/login", data={"username": "reset@test.com", "password": "brandnew123"}
    )
    assert new_login.status_code in (200, 204)


async def test_forgot_password_no_enumeration_and_bad_token(admin_client, mail_capture):
    await _enable_platform_smtp(admin_client)
    resp = await admin_client.post("/api/auth/staff/forgot-password", json={"email": "ghost@test.com"})
    assert resp.status_code == 202  # same response as for known emails (no enumeration)
    assert all(rcpt != "ghost@test.com" for rcpt, _, _ in mail_capture)

    bad = await admin_client.post(
        "/api/auth/staff/reset-password", json={"token": "garbage", "password": "whatever123"}
    )
    assert bad.status_code == 400


async def test_forgot_password_without_smtp_configured(admin_client):
    resp = await admin_client.post("/api/auth/staff/forgot-password", json={"email": "admin@test.com"})
    assert resp.status_code == 202  # silently skipped (logged), never a 500


async def test_change_email_flow(admin_client, client, make_client, mail_capture):
    await _enable_platform_smtp(admin_client)
    program_id = client.ids["program_id"]
    invite = (
        await admin_client.post(f"/api/programs/{program_id}/invites", json={"email": "changer@test.com"})
    ).json()
    researcher = await make_client()
    await researcher.post(
        "/api/auth/researchers/register", json={"token": invite["token"], "password": "res12345"}
    )

    bad = await researcher.post(
        "/api/me/email", json={"new_email": "new@test.com", "current_password": "wrong"}
    )
    assert bad.status_code == 400

    same = await researcher.post(
        "/api/me/email", json={"new_email": "changer@test.com", "current_password": "res12345"}
    )
    assert same.status_code == 400

    ok = await researcher.post(
        "/api/me/email", json={"new_email": "New@Test.com", "current_password": "res12345"}
    )
    assert ok.status_code == 200
    token = _token_from(mail_capture[-1][2])
    assert mail_capture[-1][0] == "new@test.com"  # verification goes to the NEW address

    verify = await researcher.post("/api/me/email/verify", json={"token": token})
    assert verify.status_code == 200, verify.text
    assert verify.json()["email"] == "new@test.com"
    me = await researcher.get("/api/me")
    assert me.json()["email"] == "new@test.com"

    # re-verifying the same token is idempotent, not an error
    again = await researcher.post("/api/me/email/verify", json={"token": token})
    assert again.status_code == 200

    # old email can no longer log in
    old_login = await researcher.post(
        "/api/auth/researchers/login", data={"username": "changer@test.com", "password": "res12345"}
    )
    assert old_login.status_code == 400
