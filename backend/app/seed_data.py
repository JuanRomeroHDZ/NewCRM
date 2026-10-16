import json
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import EmailAccount, PlatformAccount, PaymentMethod, UserSettings, ExchangeRate, PasswordHistory, AuditLog, Prospect
from app.security.crypto import hash_master_password, encrypt_secret, calculate_entropy

async def seed_initial_demo_data(db: AsyncSession):
    """Populates realistic demo data if database is empty."""
    # Check if already seeded
    stmt = select(UserSettings).limit(1)
    res = await db.execute(stmt)
    if res.scalar_one_or_none():
        await seed_demo_prospects(db)
        return  # already initialized

    # 1. User Settings (Master Password: "MasterPassword123!")
    master_hash = hash_master_password("MasterPassword123!")
    settings = UserSettings(
        master_password_hash=master_hash,
        vault_timeout_minutes=10,
        clipboard_clear_seconds=30,
        allow_reveal_passwords=False,
        search_hotkey="ctrl+k"
    )
    db.add(settings)

    # 2. Exchange Rate (USD to MXN)
    rate = ExchangeRate(
        base_currency="USD",
        target_currency="MXN",
        rate=18.45,
        is_manual=False
    )
    db.add(rate)

    # 3. Payment Methods
    card_nu = PaymentMethod(
        issuer="MasterCard",
        alias="Nu Débito Principal",
        last_four="8821",
        encrypted_card_number=encrypt_secret("5328 4400 1234 8821"),
        expiry_month="08",
        expiry_year="28",
        encrypted_cvv=encrypt_secret("734"),
        billing_notes="Cuenta de gastos digitales y suscripciones menores"
    )
    card_amex = PaymentMethod(
        issuer="Amex",
        alias="Amex Gold Corporativa",
        last_four="1004",
        encrypted_card_number=encrypt_secret("3759 876543 21004"),
        expiry_month="11",
        expiry_year="29",
        encrypted_cvv=encrypt_secret("4491"),
        billing_notes="Facturación en USD para servidores Cloud y APIs de IA"
    )
    card_paypal = PaymentMethod(
        issuer="PayPal",
        alias="PayPal Personal",
        last_four="0920",
        encrypted_card_number=encrypt_secret("paypal_linked_account"),
        billing_notes="Billetera digital para compras internacionales seguras"
    )
    db.add_all([card_nu, card_amex, card_paypal])
    await db.flush()

    # 4. Root Email Accounts (Recovery chain: email_proton recovers email_gmail, email_gmail recovers email_work, email_outlook recovers email_proton)
    email_proton = EmailAccount(
        address="alex.vault@proton.me",
        provider="Proton",
        inbox_url="https://mail.proton.me",
        icon="proton",
        notes="Bóveda de máxima seguridad. Correo raíz para servicios críticos y recuperación.",
        encrypted_password=encrypt_secret("Pr0t0n_S3cur3!99_Xz"),
        password_entropy=calculate_entropy("Pr0t0n_S3cur3!99_Xz")["score"],
        recovery_phone="+52 55 9876 5432",
        two_factor_method="passkey",
        encrypted_backup_codes=json.dumps([
            {"code": encrypt_secret("PRTN-8821-X9A2"), "is_used": False, "is_encrypted": True},
            {"code": encrypt_secret("PRTN-4412-B7C9"), "is_used": True, "is_encrypted": True},
            {"code": encrypt_secret("PRTN-3301-Z1M0"), "is_used": False, "is_encrypted": True}
        ]),
        encrypted_security_questions=json.dumps([
            {"question": "¿Primer servidor Linux administrado?", "answer": encrypt_secret("Debian Potato 2000"), "is_encrypted": True}
        ]),
        aliases=json.dumps(["alex.security@proton.me", "vault.recovery@proton.me"])
    )
    db.add(email_proton)
    await db.flush()

    email_gmail = EmailAccount(
        address="alex.personal@gmail.com",
        provider="Google",
        inbox_url="https://mail.google.com",
        icon="google",
        notes="Correo personal de uso diario para entretenimiento, compras y streaming.",
        encrypted_password=encrypt_secret("G00gl3#P3rs0n4l$2026"),
        password_entropy=calculate_entropy("G00gl3#P3rs0n4l$2026")["score"],
        recovery_email_id=email_proton.id,  # Recovers to Proton
        recovery_phone="+52 55 1234 5678",
        two_factor_method="authenticator",
        encrypted_backup_codes=json.dumps([
            {"code": encrypt_secret("44910293"), "is_used": False, "is_encrypted": True},
            {"code": encrypt_secret("78129034"), "is_used": False, "is_encrypted": True}
        ]),
        aliases=json.dumps(["alex.p+news@gmail.com", "alex.shopping@gmail.com"])
    )
    db.add(email_gmail)
    await db.flush()

    email_work = EmailAccount(
        address="alex.dev@techcorp.io",
        provider="Google",
        inbox_url="https://mail.google.com/a/techcorp.io",
        icon="google",
        notes="Correo empresarial. Vinculado a repositorios, clouds y proveedores de IA.",
        encrypted_password=encrypt_secret("W0rk#D3v_C0rp!8892"),
        password_entropy=calculate_entropy("W0rk#D3v_C0rp!8892")["score"],
        recovery_email_id=email_gmail.id,  # Recovers to Gmail (Chain: Proton -> Gmail -> Work)
        recovery_phone="+52 55 5555 4321",
        two_factor_method="authenticator",
        encrypted_backup_codes=json.dumps([]),
        aliases=json.dumps(["architect@techcorp.io", "alex.lead@techcorp.io"])
    )
    db.add(email_work)
    await db.flush()

    email_outlook = EmailAccount(
        address="alexander.c@outlook.com",
        provider="Outlook",
        inbox_url="https://outlook.live.com",
        icon="outlook",
        notes="Cuenta de respaldo secundario y suscripción Microsoft.",
        encrypted_password=encrypt_secret("M1cr0s0ft_Outl00k!2025"),
        password_entropy=calculate_entropy("M1cr0s0ft_Outl00k!2025")["score"],
        recovery_email_id=email_proton.id,
        two_factor_method="sms",
        aliases=json.dumps(["alex.legacy@hotmail.com"])
    )
    db.add(email_outlook)
    await db.flush()

    # Create cycle for testing cycle detection: Proton recovers to Outlook (Cycle: Proton -> Outlook -> Proton)
    email_proton.recovery_email_id = email_outlook.id
    await db.flush()

    # 5. Platforms & Services (Child Nodes)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Netflix (under Gmail)
    p_netflix = PlatformAccount(
        name="Netflix",
        email_id=email_gmail.id,
        specific_alias="alex.p+streaming@gmail.com",
        login_url="https://www.netflix.com",
        username="alex.personal@gmail.com",
        notes="Plan Premium 4K con 4 pantallas simultáneas compartidas con la familia.",
        icon_url="https://assets.nflxext.com/ffe/siteui/common/icons/nficon2016.ico",
        icon_type="extracted",
        access_type="own_password",
        encrypted_password=encrypt_secret("N3tfl1x#Str34m!2026"),
        encrypted_pin=encrypt_secret("4491"),
        subscription_status="active",
        subscription_cost=299.00,
        currency="MXN",
        billing_cycle="monthly",
        start_date="2023-01-15",
        next_billing_date=(now + timedelta(days=8)).strftime("%Y-%m-%d"),
        payment_method_id=card_nu.id,
        tags=json.dumps([{"name": "Streaming", "color": "#f43f5e"}, {"name": "Personal", "color": "#38bdf8"}])
    )

    # Spotify (under Gmail)
    p_spotify = PlatformAccount(
        name="Spotify",
        email_id=email_gmail.id,
        login_url="https://accounts.spotify.com",
        username="alexander_beats",
        notes="Plan Individual Premium. Listas de reproducción de concentración.",
        icon_url="https://open.spotifycdn.com/cdn/images/favicon.0f31d2ea.ico",
        icon_type="extracted",
        access_type="sso",  # SSO via Google
        subscription_status="active",
        subscription_cost=129.00,
        currency="MXN",
        billing_cycle="monthly",
        start_date="2022-04-10",
        next_billing_date=(now + timedelta(days=14)).strftime("%Y-%m-%d"),
        payment_method_id=card_nu.id,
        tags=json.dumps([{"name": "Streaming", "color": "#f43f5e"}, {"name": "Música", "color": "#10b981"}])
    )

    # GitHub (under Work Email)
    p_github = PlatformAccount(
        name="GitHub",
        email_id=email_work.id,
        specific_alias="alex.lead@techcorp.io",
        login_url="https://github.com/login",
        username="alex-architect",
        notes="Cuenta organizacional con acceso a repositorios core, CI/CD Actions y Secrets.",
        icon_url="https://github.githubassets.com/favicons/favicon.png",
        icon_type="extracted",
        access_type="own_password",
        encrypted_password=encrypt_secret("G1tHub#S3cur3!T0k3n_99"),
        api_keys=json.dumps([
            {
                "id": "ghp_prod_deploy",
                "label": "PAT - CI/CD GitHub Actions Deploy",
                "encrypted_key": encrypt_secret("ghp_198273645091823746501928374650192837"),
                "created_at": "2026-01-10",
                "expires_at": "2026-12-31"
            },
            {
                "id": "ghp_read_packages",
                "label": "PAT - Read Packages (Docker Registry)",
                "encrypted_key": encrypt_secret("ghp_992817263546574839201928374650192837"),
                "created_at": "2026-02-01",
                "expires_at": "2026-08-01"
            }
        ]),
        env_variables=json.dumps([
            {"key": "GITHUB_ORG_ID", "encrypted_value": encrypt_secret("techcorp-enterprise")},
            {"key": "WEBHOOK_SECRET", "encrypted_value": encrypt_secret("whsec_99182736450192837465")}
        ]),
        subscription_status="active",
        subscription_cost=21.00,
        currency="USD",
        billing_cycle="monthly",
        start_date="2021-06-01",
        next_billing_date=(now + timedelta(days=3)).strftime("%Y-%m-%d"),
        payment_method_id=card_amex.id,
        tags=json.dumps([{"name": "Desarrollo", "color": "#6366f1"}, {"name": "Trabajo", "color": "#f59e0b"}])
    )

    # Claude (Anthropic) (under Work Email)
    p_claude = PlatformAccount(
        name="Claude (Anthropic)",
        email_id=email_work.id,
        login_url="https://claude.ai/login",
        username="alex.dev@techcorp.io",
        notes="Suscripción Claude Team con acceso a Claude 3.5 Sonnet y Opus.",
        icon_url="https://claude.ai/favicon.ico",
        icon_type="extracted",
        access_type="sso",  # SSO via Google Work
        api_keys=json.dumps([
            {
                "id": "anthropic_prod_key",
                "label": "API Key de Producción (Backend)",
                "encrypted_key": encrypt_secret("sk-ant-api03-9182736450192837465019283746501928374650192837-AA"),
                "created_at": "2026-02-15",
                "expires_at": "2027-02-15"
            }
        ]),
        env_variables=json.dumps([
            {"key": "ANTHROPIC_ORG_ID", "encrypted_value": encrypt_secret("org_anthropic_corp_99")}
        ]),
        subscription_status="active",
        subscription_cost=30.00,
        currency="USD",
        billing_cycle="monthly",
        start_date="2024-03-01",
        next_billing_date=(now + timedelta(days=19)).strftime("%Y-%m-%d"),
        payment_method_id=card_amex.id,
        tags=json.dumps([{"name": "IA", "color": "#8b5cf6"}, {"name": "Trabajo", "color": "#f59e0b"}])
    )

    # ChatGPT Plus (under Gmail)
    p_chatgpt = PlatformAccount(
        name="ChatGPT Plus",
        email_id=email_gmail.id,
        login_url="https://chatgpt.com",
        username="alex.personal@gmail.com",
        notes="Suscripción individual con Canvas y Advanced Voice Mode.",
        icon_url="https://chatgpt.com/favicon.ico",
        icon_type="extracted",
        access_type="sso",
        subscription_status="active",
        subscription_cost=20.00,
        currency="USD",
        billing_cycle="monthly",
        start_date="2023-05-10",
        next_billing_date=(now + timedelta(days=10)).strftime("%Y-%m-%d"),
        payment_method_id=card_nu.id,
        tags=json.dumps([{"name": "IA", "color": "#8b5cf6"}, {"name": "Personal", "color": "#38bdf8"}])
    )

    # Midjourney (Free Trial expiring soon!) (under Gmail)
    p_midjourney = PlatformAccount(
        name="Midjourney",
        email_id=email_gmail.id,
        login_url="https://www.midjourney.com",
        username="alex_artist",
        notes="Prueba gratuita de 14 días para generación de prototipos visuales de interfaz.",
        icon_type="initials",
        access_type="own_password",
        encrypted_password=encrypt_secret("M1dj0urn3y#Art!2026"),
        subscription_status="free_trial",
        subscription_cost=10.00,
        currency="USD",
        billing_cycle="monthly",
        start_date=(now - timedelta(days=11)).strftime("%Y-%m-%d"),
        trial_end_date=(now + timedelta(days=3)).strftime("%Y-%m-%d"),  # Expiring in 3 days!
        next_billing_date=(now + timedelta(days=3)).strftime("%Y-%m-%d"),
        payment_method_id=card_nu.id,
        tags=json.dumps([{"name": "IA", "color": "#8b5cf6"}, {"name": "Diseño", "color": "#ec4899"}])
    )

    # AWS Cloud (under Proton Mail - Critical Infrastructure)
    p_aws = PlatformAccount(
        name="AWS Enterprise Cloud",
        email_id=email_proton.id,
        login_url="https://console.aws.amazon.com",
        username="root-cloud-admin",
        notes="Cuenta raíz AWS con MFA por Passkey para infraestructura de producción.",
        icon_url="https://a0.awsstatic.com/libra-css/images/site/fav/favicon.ico",
        icon_type="extracted",
        access_type="own_password",
        encrypted_password=encrypt_secret("AWS#R00t_P4ss!M4st3r_9988"),
        encrypted_pin=encrypt_secret("9910"),
        api_keys=json.dumps([
            {
                "id": "aws_access_key_root",
                "label": "AWS Access Key ID (Terraform)",
                "encrypted_key": encrypt_secret("AKIAIOSFODNN7EXAMPLE"),
                "created_at": "2025-08-01",
                "expires_at": "2027-08-01"
            }
        ]),
        env_variables=json.dumps([
            {"key": "AWS_SECRET_ACCESS_KEY", "encrypted_value": encrypt_secret("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY")},
            {"key": "AWS_DEFAULT_REGION", "encrypted_value": encrypt_secret("us-east-1")}
        ]),
        subscription_status="active",
        subscription_cost=185.50,
        currency="USD",
        billing_cycle="monthly",
        start_date="2022-09-01",
        next_billing_date=(now + timedelta(days=22)).strftime("%Y-%m-%d"),
        payment_method_id=card_amex.id,
        tags=json.dumps([{"name": "Cloud", "color": "#06b6d4"}, {"name": "Infraestructura", "color": "#6366f1"}])
    )

    # Notion (under Work Email)
    p_notion = PlatformAccount(
        name="Notion Team",
        email_id=email_work.id,
        login_url="https://www.notion.so/login",
        username="alex.dev@techcorp.io",
        notes="Documentación de arquitectura, PRDs y roadmap del producto.",
        icon_url="https://www.notion.so/images/favicon.ico",
        icon_type="extracted",
        access_type="sso",
        subscription_status="active",
        subscription_cost=10.00,
        currency="USD",
        billing_cycle="monthly",
        start_date="2023-02-01",
        next_billing_date=(now + timedelta(days=5)).strftime("%Y-%m-%d"),
        payment_method_id=card_amex.id,
        tags=json.dumps([{"name": "Productividad", "color": "#10b981"}, {"name": "Trabajo", "color": "#f59e0b"}])
    )

    # Vercel Pro (under Work Email)
    p_vercel = PlatformAccount(
        name="Vercel Pro",
        email_id=email_work.id,
        login_url="https://vercel.com/login",
        username="alex-techcorp",
        notes="Despliegue de frontends, Serverless edge functions y dominios personalizados.",
        icon_url="https://assets.vercel.com/image/upload/front/favicon/vercel/favicon.ico",
        icon_type="extracted",
        access_type="sso",
        subscription_status="active",
        subscription_cost=20.00,
        currency="USD",
        billing_cycle="monthly",
        start_date="2024-01-01",
        next_billing_date=(now + timedelta(days=12)).strftime("%Y-%m-%d"),
        payment_method_id=card_amex.id,
        tags=json.dumps([{"name": "Cloud", "color": "#06b6d4"}, {"name": "Desarrollo", "color": "#6366f1"}])
    )

    db.add_all([p_netflix, p_spotify, p_github, p_claude, p_chatgpt, p_midjourney, p_aws, p_notion, p_vercel])
    await db.flush()

    # Initial Audit Logs
    db.add(AuditLog(
        timestamp=now - timedelta(days=2),
        action="create",
        entity_type="system",
        entity_name="EmailSaver",
        details="Inicialización del sistema con bóveda relacional y cifrado AES-256-GCM + Argon2id"
    ))

    await db.commit()
    await seed_demo_prospects(db)


async def seed_demo_prospects(db: AsyncSession):
    """Seeds initial CRM & Demo prospects if the prospects table is empty."""
    check = await db.execute(select(Prospect).limit(1))
    if check.scalar_one_or_none():
        return

    emails_res = await db.execute(select(EmailAccount).where(EmailAccount.is_deleted == False))
    emails = emails_res.scalars().all()
    email_by_addr = {e.address: e for e in emails}
    work_email = email_by_addr.get("alex.dev@techcorp.io") or (emails[0] if emails else None)
    gmail_email = email_by_addr.get("alex.personal@gmail.com") or work_email
    proton_email = email_by_addr.get("alex.vault@proton.me") or work_email

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # 1. En Tiempo (Pendiente) - Demo creada + Primer Contacto enviado hace 9 horas (SLA: 48h)
    pr_clinica = Prospect(
        company_name="Clínica Dental Sonrisa Perfecta",
        contact_name="Dra. Mariana Vega",
        contact_email="contacto@sonrisaperfecta.mx",
        email_id=work_email.id if work_email else None,
        specific_alias="alex.lead@techcorp.io" if work_email else None,
        workflow_type="demo_first",
        status="primer_contacto",
        demo_url="https://demo-sonrisa-perfecta.vercel.app",
        whatsapp="+52 55 4123 8910",
        phones="+52 55 4123 8910, (55) 5678 1234",
        maps_url="https://maps.google.com/?q=Av.+Insurgentes+Sur+1450,+CDMX",
        social_links="Instagram: @sonrisaperfectamx | FB: /SonrisaPerfectaCDMX",
        notes="Se armó landing page demo con agendamiento por WhatsApp y galería antes/después. Primer mensaje enviado con link de vista previa.",
        tags=json.dumps([{"name": "Salud", "color": "#10b981"}, {"name": "Landing Demo", "color": "#6366f1"}]),
        started_at=now - timedelta(hours=9, minutes=25),
        sla_hours=48.0
    )

    # 2. Cumplido (Éxito) - Respondió en 5h 42m dentro de un SLA de 24h
    start_roasters = now - timedelta(hours=30)
    resp_roasters = start_roasters + timedelta(hours=5, minutes=42, seconds=18)
    pr_roasters = Prospect(
        company_name="Café Origen & Tostadores",
        contact_name="Carlos Mendoza",
        contact_email="hola@cafeorigen.mx",
        email_id=work_email.id if work_email else None,
        workflow_type="demo_first",
        status="respondido",
        demo_url="https://cafe-origen-demo.vercel.app",
        whatsapp="+52 33 1987 6543",
        phones="+52 33 1987 6543",
        maps_url="https://maps.google.com/?q=Colonia+Americana,+Guadalajara",
        social_links="IG: @cafeorigengdl | TikTok: @cafeorigen",
        notes="Les encantó el catálogo interactivo de granos de especialidad en la página demo. Pidieron agregar pasarela Stripe.",
        tags=json.dumps([{"name": "E-Commerce", "color": "#f59e0b"}, {"name": " Prioridad", "color": "#10b981"}]),
        started_at=start_roasters,
        sla_hours=24.0,
        responded_at=resp_roasters,
        response_time_seconds=int((resp_roasters - start_roasters).total_seconds()),
        met_sla=True
    )

    # 3. Vencido (Alerta) - Pasaron 62 horas y el límite era 48h sin respuesta
    pr_inmobiliaria = Prospect(
        company_name="Grupo Inmobiliario Altavista",
        contact_name="Lic. Roberto Domínguez",
        contact_email="rdominguez@altavistagrupo.com",
        email_id=proton_email.id if proton_email else None,
        workflow_type="demo_first",
        status="tiempo_agotado",
        demo_url="https://altavista-residencial-demo.vercel.app",
        whatsapp="+52 81 8345 9012",
        phones="+52 81 8345 9012 / Oficina: 81 1122 3344",
        maps_url="https://maps.google.com/?q=San+Pedro+Garza+Garcia,+NL",
        social_links="Web actual: altavistagrupo.com (Sin SSL)",
        notes="Se construyó demo de catálogo de desarrollos con filtro por zona. No han respondido al primer mensaje; programar llamada de seguimiento.",
        tags=json.dumps([{"name": "Inmobiliaria", "color": "#06b6d4"}, {"name": "Seguimiento", "color": "#f43f5e"}]),
        started_at=now - timedelta(hours=62, minutes=15),
        sla_hours=48.0
    )

    # 4. Flujo Cotización Directa - En Tiempo (Pendiente) con SLA de 72h (3 días)
    pr_logistica = Prospect(
        company_name="Transportes & Logística del Bajío",
        contact_name="Ing. Fernando Ríos",
        contact_email="frios@logisticabajio.mx",
        email_id=gmail_email.id if gmail_email else None,
        workflow_type="direct_quote",
        status="en_cotizacion",
        demo_url="https://propuesta-logistica-bajio.vercel.app",
        whatsapp="+52 477 234 5678",
        phones="+52 477 234 5678",
        maps_url="https://maps.google.com/?q=Puerto+Interior,+Leon+Guanajuato",
        social_links="LinkedIn: /company/logistica-bajio",
        notes="Contacto directo para cotizar portal de rastreo de flotillas y rediseño corporativo. Cotización enviada por correo.",
        tags=json.dumps([{"name": "B2B Corporativo", "color": "#8b5cf6"}, {"name": "Cotización", "color": "#38bdf8"}]),
        started_at=now - timedelta(hours=18, minutes=40),
        sla_hours=72.0
    )

    # 5. Demo Recién Creada - Lista para enviar primer contacto (SLA: 24h)
    pr_restaurante = Prospect(
        company_name="Bistró & Terraza Botánica",
        contact_name="Chef Sofía Navarro",
        contact_email="reservas@terrazabotanica.mx",
        email_id=gmail_email.id if gmail_email else None,
        workflow_type="demo_first",
        status="demo_creada",
        demo_url="https://terraza-botanica-menu.vercel.app",
        whatsapp="+52 55 8765 4321",
        phones="+52 55 8765 4321",
        maps_url="https://maps.google.com/?q=Roma+Norte,+CDMX",
        social_links="IG: @terrazabotanicamx",
        notes="Menú QR interactivo + reservación de mesas listo en producción. Falta enviar mensaje de WhatsApp con el link.",
        tags=json.dumps([{"name": "Restaurante", "color": "#ec4899"}, {"name": "Demo Creada", "color": "#6366f1"}]),
        started_at=now - timedelta(hours=2, minutes=10),
        sla_hours=24.0
    )

    db.add_all([pr_clinica, pr_roasters, pr_inmobiliaria, pr_logistica, pr_restaurante])
    await db.commit()

