import os

os.environ["ENV"] = "test"

import pytest_asyncio
from fastapi_users.password import PasswordHelper
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base, get_session
from app.main import app
from app.models import Org, Program, StaffUser


@pytest_asyncio.fixture
async def db_session_factory():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield factory
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session_factory):
    async def override_get_session():
        async with db_session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session

    async with db_session_factory() as session:
        org = Org(name="Test Org", slug="test-org")
        session.add(org)
        await session.flush()
        session.add_all(
            [
                StaffUser(
                    email="admin@test.com",
                    name="Admin",
                    global_role="super_admin",
                    hashed_password=PasswordHelper().hash("admin1234"),
                    is_active=True,
                    org_id=org.id,
                ),
                StaffUser(
                    email="plain@test.com",
                    name="Plain",
                    global_role="staff",
                    hashed_password=PasswordHelper().hash("plain1234"),
                    is_active=True,
                    org_id=org.id,
                ),
            ]
        )
        program = Program(
            org_id=org.id,
            name="Test Program",
            slug="test-program",
            description="seeded",
            scope_markdown="# Scope\nin-scope: test",
            status="active",
            visibility="public",
        )
        session.add(program)
        await session.commit()
        client_ids = {"program_id": str(program.id)}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        c.ids = client_ids  # type: ignore[attr-defined]
        yield c

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def admin_client(client):
    resp = await client.post(
        "/api/auth/staff/login", data={"username": "admin@test.com", "password": "admin1234"}
    )
    assert resp.status_code in (200, 204), resp.text
    return client


@pytest_asyncio.fixture
async def plain_client(fresh_client):
    """A second staff user in a separate cookie jar (admin_client and plain_client share no cookies)."""
    resp = await fresh_client.post(
        "/api/auth/staff/login", data={"username": "plain@test.com", "password": "plain1234"}
    )
    assert resp.status_code in (200, 204), resp.text
    return fresh_client


@pytest_asyncio.fixture
async def fresh_client():
    """An independent cookie jar against the same app (e.g. a second researcher)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def make_client():
    """Factory for isolated cookie jars (staff and researcher sessions never share a browser)."""
    clients: list[AsyncClient] = []

    async def _make() -> AsyncClient:
        c = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
        clients.append(c)
        return c

    yield _make
    for c in clients:
        await c.aclose()
