"""End-to-end API tests over an in-memory SQLite database."""


async def test_health(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_unauthenticated_access_denied(client):
    assert (await client.get("/api/programs")).status_code == 401
    assert (await client.get("/api/reports")).status_code == 401


async def test_staff_login_rejects_bad_password(client):
    resp = await client.post(
        "/api/auth/staff/login", data={"username": "admin@test.com", "password": "wrong"}
    )
    assert resp.status_code == 400


async def test_me_endpoint(admin_client):
    resp = await admin_client.get("/api/me")
    assert resp.status_code == 200
    body = resp.json()
    assert body["kind"] == "staff"
    assert body["global_role"] == "super_admin"


async def test_program_create_and_rbac(admin_client, plain_client):
    resp = await admin_client.post(
        "/api/programs",
        json={"name": "Acme Web", "scope_markdown": "in scope: acme.com", "status": "active", "visibility": "public"},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["slug"] == "acme-web"
    program_id = resp.json()["id"]

    # Plain staff (global "staff", no program role) sees nothing and is denied detail
    listing = await plain_client.get("/api/programs")
    assert listing.status_code == 200
    assert listing.json() == []
    assert (await plain_client.get(f"/api/programs/{program_id}")).status_code == 403

    # org-level admin sees everything
    listing = await admin_client.get("/api/programs")
    assert {p["slug"] for p in listing.json()} >= {"acme-web", "test-program"}


async def test_program_role_grants_scoped_access(admin_client, plain_client):
    program_id = (await admin_client.get("/api/programs")).json()[0]["id"]
    staff_listing = await admin_client.get("/api/staff")
    plain_id = next(s["id"] for s in staff_listing.json() if s["email"] == "plain@test.com")

    resp = await admin_client.post(
        f"/api/programs/{program_id}/roles", json={"staff_id": plain_id, "role": "triager"}
    )
    assert resp.status_code == 201, resp.text

    detail = await plain_client.get(f"/api/programs/{program_id}")
    assert detail.status_code == 200

    # triager can view but not edit scope
    patch = await plain_client.patch(f"/api/programs/{program_id}", json={"scope_markdown": "hijacked"})
    assert patch.status_code == 403

    # promoting to viewer again works via upsert
    resp = await admin_client.post(
        f"/api/programs/{program_id}/roles", json={"staff_id": plain_id, "role": "viewer"}
    )
    assert resp.status_code == 201
    assert resp.json()["role"] == "viewer"


async def test_invite_register_and_full_report_flow(admin_client, client, make_client):
    program_id = client.ids["program_id"]
    researcher = await make_client()  # researcher session never shares the staff cookie jar

    # staff creates a direct invite
    resp = await admin_client.post(f"/api/programs/{program_id}/invites", json={"email": "Res@Test.com"})
    assert resp.status_code == 201, resp.text
    invite = resp.json()

    # public invite pre-check
    info = await client.get(f"/api/public/invites/{invite['token']}")
    assert info.status_code == 200 and info.json()["valid"] is True
    assert info.json()["email_masked"].startswith("r***@")

    # researcher activates via invite token -> auto-logged in
    resp = await researcher.post(
        "/api/auth/researchers/register",
        json={"token": invite["token"], "password": "res12345", "name": "Res One"},
    )
    assert resp.status_code == 201, resp.text
    me = await researcher.get("/api/me")
    assert me.json()["kind"] == "researcher"

    # membership grants program visibility incl. scope
    programs = await researcher.get("/api/programs")
    assert [p["id"] for p in programs.json()] == [program_id]
    detail = await researcher.get(f"/api/programs/{program_id}")
    assert "in-scope" in detail.json()["scope_markdown"]

    # submit a report
    resp = await researcher.post(
        "/api/reports",
        json={
            "program_id": program_id,
            "title": "Stored XSS in profile",
            "description": "payload persists",
            "severity": "high",
            "cvss": "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:L/A:N",
            "repro_steps": "1. create profile 2. inject",
            "affected_asset": "demo.example.com/api/profile",
        },
    )
    assert resp.status_code == 201, resp.text
    report = resp.json()
    assert report["status"] == "new"

    # staff triage: assign + move status
    admin_listing = await admin_client.get("/api/staff")
    admin_id = next(s["id"] for s in admin_listing.json() if s["email"] == "admin@test.com")
    resp = await admin_client.patch(
        f"/api/reports/{report['id']}/triage",
        json={"status": "triaging", "assigned_staff_id": admin_id},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["assigned_staff_name"] == "Admin"

    # researcher can still edit own report while triaging
    resp = await researcher.patch(f"/api/reports/{report['id']}", json={"title": "Stored XSS in profile (upd)"})
    assert resp.status_code == 200, resp.text

    # move to accepted -> researcher edits are locked
    resp = await admin_client.patch(f"/api/reports/{report['id']}/triage", json={"status": "accepted"})
    assert resp.status_code == 200
    locked = await researcher.patch(f"/api/reports/{report['id']}", json={"title": "nope"})
    assert locked.status_code == 403

    # comments: internal stays staff-side
    assert (
        await researcher.post(f"/api/reports/{report['id']}/comments", json={"body": "any update?"})
    ).status_code == 201
    assert (
        await admin_client.post(
            f"/api/reports/{report['id']}/comments", json={"body": "bounty approved internally", "internal_only": True}
        )
    ).status_code == 201
    researcher_view = (await researcher.get(f"/api/reports/{report['id']}/comments")).json()
    assert len(researcher_view) == 1 and researcher_view[0]["author_kind"] == "researcher"
    staff_view = (await admin_client.get(f"/api/reports/{report['id']}/comments")).json()
    assert len(staff_view) == 2

    # invite is single-use
    second_client = await make_client()
    second = await second_client.post(
        "/api/auth/researchers/register", json={"token": invite["token"], "password": "res12345"}
    )
    assert second.status_code == 400


async def test_public_application_auto_invite_flow(admin_client, client, fresh_client):
    program_id = client.ids["program_id"]

    resp = await fresh_client.post(
        "/api/public/applications",
        json={"email": "applicant@test.com", "name": "App Llicant", "program_id": program_id, "message": "hello"},
    )
    assert resp.status_code == 201, resp.text
    application_id = resp.json()["id"]

    pending = await admin_client.get("/api/applications", params={"status": "pending"})
    assert any(a["id"] == application_id for a in pending.json())

    approve = await admin_client.post(f"/api/applications/{application_id}/approve", json={})
    assert approve.status_code == 200, approve.text
    token = approve.json()["token"]

    # approving twice is rejected
    again = await admin_client.post(f"/api/applications/{application_id}/approve", json={})
    assert again.status_code == 400

    # the auto-created invite lands in the same activation flow
    reg = await fresh_client.post(
        "/api/auth/researchers/register", json={"token": token, "password": "res12345", "name": "App"}
    )
    assert reg.status_code == 201, reg.text
    programs = await fresh_client.get("/api/programs")
    assert [p["id"] for p in programs.json()] == [program_id]

    submit = await fresh_client.post(
        "/api/reports", json={"program_id": program_id, "title": "IDOR", "severity": "critical"}
    )
    assert submit.status_code == 201, submit.text


async def test_researchers_cannot_see_each_others_reports(admin_client, client, make_client):
    program_id = client.ids["program_id"]
    tokens = []
    for email in ("r1@test.com", "r2@test.com"):
        invite = (
            await admin_client.post(f"/api/programs/{program_id}/invites", json={"email": email})
        ).json()
        jar = await make_client()
        resp = await jar.post(
            "/api/auth/researchers/register", json={"token": invite["token"], "password": "res12345"}
        )
        assert resp.status_code == 201
        tokens.append(jar)

    r1, r2 = tokens
    report = (
        await r1.post("/api/reports", json={"program_id": program_id, "title": "r1 secret", "severity": "low"})
    ).json()

    assert (await r2.get(f"/api/reports/{report['id']}")).status_code == 404
    listing = (await r2.get("/api/reports")).json()
    assert all(rep["id"] != report["id"] for rep in listing)
    assert (await r2.get(f"/api/reports/{report['id']}/comments")).status_code == 404

    # staff sees it
    staff_listing = (await admin_client.get("/api/reports")).json()
    assert any(rep["id"] == report["id"] for rep in staff_listing)


async def test_plain_staff_without_program_role_cannot_triage(admin_client, client, plain_client, make_client):
    program_id = client.ids["program_id"]
    invite = (await admin_client.post(f"/api/programs/{program_id}/invites", json={"email": "x@test.com"})).json()
    researcher = await make_client()
    await researcher.post("/api/auth/researchers/register", json={"token": invite["token"], "password": "res12345"})
    report = (
        await researcher.post("/api/reports", json={"program_id": program_id, "title": "t", "severity": "low"})
    ).json()
    assert (await plain_client.patch(f"/api/reports/{report['id']}/triage", json={"status": "triaging"})).status_code == 403
    assert (await plain_client.get(f"/api/reports/{report['id']}")).status_code == 403


async def test_public_program_listing(client, admin_client):
    # seed program is active+public; create a private one that must stay hidden
    await admin_client.post(
        "/api/programs", json={"name": "Private One", "visibility": "private", "status": "active"}
    )
    listing = await client.get("/api/public/programs")
    names = [p["name"] for p in listing.json()]
    assert "Test Program" in names and "Private One" not in names


async def test_public_report_form_disabled_by_default(admin_client, client):
    program_id = client.ids["program_id"]
    slug = (await admin_client.get(f"/api/programs/{program_id}")).json()["slug"]

    info = await client.get(f"/api/public/programs/{slug}/report-form")
    assert info.status_code == 200
    assert info.json()["available"] is False

    resp = await client.post(f"/api/public/programs/{slug}/reports", json={"title": "should fail"})
    assert resp.status_code == 403


async def test_public_report_form_anonymous_and_email(admin_client, client, make_client):
    program_id = client.ids["program_id"]
    patch = await admin_client.patch(f"/api/programs/{program_id}", json={"public_reporting": True})
    assert patch.status_code == 200 and patch.json()["public_reporting"] is True
    slug = (await admin_client.get(f"/api/programs/{program_id}")).json()["slug"]

    info = await client.get(f"/api/public/programs/{slug}/report-form")
    assert info.json()["available"] is True
    assert info.json()["program_name"]

    anon = await client.post(
        f"/api/public/programs/{slug}/reports", json={"title": "anon bug", "severity": "low"}
    )
    assert anon.status_code == 201, anon.text
    body = anon.json()
    assert body["email"] is None and body["reference"]

    with_email = await client.post(
        f"/api/public/programs/{slug}/reports",
        json={"title": "email bug", "email": "ghost@example.com", "description": "hi"},
    )
    assert with_email.status_code == 201
    assert with_email.json()["email"] == "ghost@example.com"

    listing = (await admin_client.get("/api/reports", params={"program_id": program_id})).json()
    names = [r["researcher_name"] for r in listing]
    assert any(n.startswith("Anonymous") for n in names)
    assert any("ghost@example.com" in n for n in names)

    # staff can triage an anonymous report like any other
    anon_report = next(r for r in listing if r["researcher_name"].startswith("Anonymous"))
    triage = await admin_client.patch(
        f"/api/reports/{anon_report['id']}/triage", json={"status": "triaging"}
    )
    assert triage.status_code == 200


async def test_platform_settings_gate_applications(admin_client, plain_client, client, make_client):
    # default state: applications enabled
    ok = await (await make_client()).post(
        "/api/public/applications", json={"email": "gate1@example.com"}
    )
    assert ok.status_code == 201

    # settings are super_admin-only
    assert (await admin_client.get("/api/settings")).status_code == 200
    assert (await plain_client.get("/api/settings")).status_code == 403
    assert (await plain_client.patch("/api/settings", json={"researcher_applications_enabled": False})).status_code == 403

    disabled = await admin_client.patch("/api/settings", json={"researcher_applications_enabled": False})
    assert disabled.status_code == 200 and disabled.json()["researcher_applications_enabled"] is False

    flag = await client.get("/api/public/platform")
    assert flag.json()["researcher_applications_enabled"] is False

    denied = await (await make_client()).post(
        "/api/public/applications", json={"email": "gate2@example.com"}
    )
    assert denied.status_code == 403

    reenabled = await admin_client.patch("/api/settings", json={"researcher_applications_enabled": True})
    assert reenabled.json()["researcher_applications_enabled"] is True
