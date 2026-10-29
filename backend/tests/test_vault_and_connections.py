import pytest
from app.models import EmailAccount, PlatformAccount, PaymentMethod, Prospect, UserSettings
from app.security.crypto import hash_master_password, encrypt_secret
from app.services.graph import generate_relational_graph

@pytest.mark.asyncio
async def test_graph_nodes_have_module_and_no_secrets(db_session):
    # Setup master settings
    settings = UserSettings(
        master_password_hash=hash_master_password("TestMaster123!"),
        vault_salt="1234567890abcdef1234567890abcdef"
    )
    db_session.add(settings)

    email = EmailAccount(
        address="contacto@lessso.mx",
        provider="Google",
        encrypted_password=encrypt_secret("MiClaveSuperSecreta!")
    )
    db_session.add(email)
    await db_session.flush()

    platform = PlatformAccount(
        email_id=email.id,
        name="DigitalOcean Cloud",
        encrypted_password=encrypt_secret("ClaveDigitalOcean!"),
        username="admin_do"
    )
    db_session.add(platform)

    payment = PaymentMethod(
        issuer="Visa",
        alias="Tarjeta Débito BBVA",
        last_four="4321",
        encrypted_card_number=encrypt_secret("4152313131314321")
    )
    db_session.add(payment)

    prospect = Prospect(
        company_name="Innovatech Tijuana",
        contact_name="Lic. Roberto"
    )
    db_session.add(prospect)
    await db_session.commit()

    graph = await generate_relational_graph(db_session)
    assert len(graph["nodes"]) >= 4

    for node in graph["nodes"]:
        assert "module" in node
        assert node["module"] in ("vault", "finances", "crm", "agenda", "workshop", "system")
        # Ensure no secrets leak in label or metrics
        assert "MiClaveSuperSecreta" not in str(node)
        assert "ClaveDigitalOcean" not in str(node)
        assert "4152313131314321" not in str(node)

@pytest.mark.asyncio
async def test_secret_reveal_reauthentication(client, auth_token, db_session):
    email = EmailAccount(
        address="seguro@lessso.mx",
        provider="Google",
        encrypted_password=encrypt_secret("SecretoSensible2026!")
    )
    db_session.add(email)
    await db_session.commit()
    await db_session.refresh(email)

    # 1. Invalid reauthentication password returns 401
    bad_res = await client.post(
        "/api/v1/security/reveal",
        json={
            "target_type": "email",
            "target_id": email.id,
            "field_name": "password",
            "master_password": "PasswordEquivocada!"
        },
        headers={"x-vault-token": auth_token}
    )
    assert bad_res.status_code == 401

    # 2. Valid master password reveals secret and logs audit event
    good_res = await client.post(
        "/api/v1/security/reveal",
        json={
            "target_type": "email",
            "target_id": email.id,
            "field_name": "password",
            "master_password": "MasterPasswordTest123!"
        },
        headers={"x-vault-token": auth_token}
    )
    assert good_res.status_code == 200
    data = good_res.json()
    assert data["decrypted_value"] == "SecretoSensible2026!"
    assert "revealed_at" in data
