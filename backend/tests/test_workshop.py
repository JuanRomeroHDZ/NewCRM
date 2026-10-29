import pytest
from app.models.core import User
from app.models import InternalProject
from app.security.crypto import hash_master_password
from app.services.core_auth import create_user_session
from app.services.workshop_sanitizer import sanitize_svg_content, sanitize_formula_injection

@pytest.mark.asyncio
async def test_svg_sanitization_removes_xss_vectors():
    malicious_svg = """<svg xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" onload="alert('XSS')" />
        <script>alert(document.cookie);</script>
        <a href="javascript:alert('pwned')"><text x="10" y="20">Click me</text></a>
    </svg>"""

    sanitized = sanitize_svg_content(malicious_svg)
    assert "<script" not in sanitized.lower()
    assert "onload" not in sanitized.lower()
    assert "javascript:" not in sanitized.lower()
    assert "<circle" in sanitized

@pytest.mark.asyncio
async def test_formula_injection_sanitization():
    dangerous_inputs = ["=SUM(A1:A10)", "+cmd|' /C calc'!A0", "-2+3", "@SUM(B1:B5)", "\talert()"]
    for inp in dangerous_inputs:
        safe = sanitize_formula_injection(inp)
        assert safe.startswith("'")

    safe_input = "Texto Normal Seguro"
    assert sanitize_formula_injection(safe_input) == "Texto Normal Seguro"

@pytest.mark.asyncio
async def test_workshop_hash_and_password_generator(client, db_session):
    owner = User(
        username="owner_workshop",
        email="owner_ws@lessso.local",
        full_name="Owner Workshop",
        role="owner",
        hashed_password=hash_master_password("TestOwner123!"),
        is_active=True
    )
    db_session.add(owner)
    await db_session.commit()
    token, _ = await create_user_session(db_session, owner)

    # 1. Compute SHA-256
    hash_res = await client.post(
        "/api/v1/workshop/hash",
        json={"text": "LESSSO2026", "algorithm": "sha256"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert hash_res.status_code == 200
    assert len(hash_res.json()["hash_result"]) == 64

    # 2. Generate secure password
    pw_res = await client.post(
        "/api/v1/workshop/generate-password",
        json={"length": 24, "include_symbols": True, "include_digits": True},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert pw_res.status_code == 200
    data = pw_res.json()
    assert len(data["password"]) == 24
    assert data["entropy_bits"] > 80
    assert data["strength"] == "muy_fuerte"

@pytest.mark.asyncio
async def test_internal_projects_in_workshop(client, db_session):
    owner = User(
        username="owner_proj",
        email="owner_proj@lessso.local",
        full_name="Owner Proyectos",
        role="owner",
        hashed_password=hash_master_password("TestOwner123!"),
        is_active=True
    )
    db_session.add(owner)
    await db_session.commit()
    token, _ = await create_user_session(db_session, owner)

    # Create project
    create_res = await client.post(
        "/api/v1/workshop/projects",
        json={
            "name": "Portal de Clientes LESSSO",
            "category": "SaaS / Frontend",
            "status": "en_desarrollo",
            "tech_stack": "React, TypeScript, FastAPI",
            "monthly_maintenance_cost": 500.0
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert create_res.status_code == 201

    # List projects
    list_res = await client.get(
        "/api/v1/workshop/projects",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert list_res.status_code == 200
    projects = list_res.json()
    assert any(p["name"] == "Portal de Clientes LESSSO" for p in projects)
