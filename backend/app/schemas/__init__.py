from typing import Any
from pydantic import BaseModel, EmailStr, Field

# Auth & Vault
class MasterPasswordSetup(BaseModel):
    master_password: str = Field(..., min_length=6)

class VaultUnlockRequest(BaseModel):
    master_password: str

class VaultStatusResponse(BaseModel):
    is_setup: bool
    is_unlocked: bool
    remaining_seconds: int
    timeout_minutes: int
    clipboard_clear_seconds: int
    allow_reveal_passwords: bool
    search_hotkey: str
    accent_color: str = "#6366f1"
    canvas_style: str = "dot-grid"

# Email items
class BackupCodeItem(BaseModel):
    code: str
    is_used: bool = False

class SecurityQuestionItem(BaseModel):
    question: str
    answer: str

class EmailBase(BaseModel):
    address: str
    provider: str = "Google"
    inbox_url: str | None = None
    icon: str | None = None
    notes: str | None = None
    recovery_email_id: str | None = None
    recovery_phone: str | None = None
    two_factor_method: str = "none"
    aliases: list[str] = []

class EmailCreate(EmailBase):
    password: str | None = None
    backup_codes: list[BackupCodeItem] = []
    security_questions: list[SecurityQuestionItem] = []

class EmailUpdate(BaseModel):
    address: str | None = None
    provider: str | None = None
    inbox_url: str | None = None
    icon: str | None = None
    notes: str | None = None
    password: str | None = None
    recovery_email_id: str | None = None
    recovery_phone: str | None = None
    two_factor_method: str | None = None
    backup_codes: list[BackupCodeItem] | None = None
    security_questions: list[SecurityQuestionItem] | None = None
    aliases: list[str] | None = None

class EmailResponse(EmailBase):
    id: str
    has_password: bool = False
    password_masked: str = "••••••••"
    password_plain: str | None = None  # only when unlocked & requested
    password_entropy: int = 0
    entropy_details: dict | None = None
    backup_codes: list[BackupCodeItem] = []
    security_questions: list[SecurityQuestionItem] = []
    platform_count: int = 0
    prospect_count: int = 0
    recovery_email_address: str | None = None
    is_deleted: bool = False
    created_at: Any = None
    updated_at: Any = None

# Platform items
class ApiKeyItem(BaseModel):
    id: str
    label: str
    key: str | None = None
    key_masked: str = "••••••••••••••••"
    created_at: str | None = None
    expires_at: str | None = None

class EnvVarItem(BaseModel):
    key: str
    value: str | None = None
    value_masked: str = "••••••••"

class TagItem(BaseModel):
    name: str
    color: str = "#6366f1"

class PlatformBase(BaseModel):
    name: str
    email_id: str
    specific_alias: str | None = None
    login_url: str | None = None
    username: str | None = None
    notes: str | None = None
    icon_url: str | None = None
    icon_type: str = "catalog"
    access_type: str = "own_password"
    subscription_status: str = "active"
    subscription_cost: float = 0.0
    currency: str = "MXN"
    billing_cycle: str = "monthly"
    start_date: str | None = None
    next_billing_date: str | None = None
    trial_end_date: str | None = None
    payment_method_id: str | None = None
    tags: list[TagItem] = []

class PlatformCreate(PlatformBase):
    password: str | None = None
    pin: str | None = None
    recovery_codes: str | None = None
    totp_secret: str | None = None
    api_keys: list[ApiKeyItem] = []
    env_variables: list[EnvVarItem] = []

class PlatformUpdate(BaseModel):
    name: str | None = None
    email_id: str | None = None
    specific_alias: str | None = None
    login_url: str | None = None
    username: str | None = None
    notes: str | None = None
    icon_url: str | None = None
    icon_type: str | None = None
    access_type: str | None = None
    password: str | None = None
    pin: str | None = None
    recovery_codes: str | None = None
    totp_secret: str | None = None
    api_keys: list[ApiKeyItem] | None = None
    env_variables: list[EnvVarItem] | None = None
    subscription_status: str | None = None
    subscription_cost: float | None = None
    currency: str | None = None
    billing_cycle: str | None = None
    start_date: str | None = None
    next_billing_date: str | None = None
    trial_end_date: str | None = None
    payment_method_id: str | None = None
    tags: list[TagItem] | None = None

class PlatformResponse(PlatformBase):
    id: str
    email_address: str | None = None
    payment_alias: str | None = None
    has_password: bool = False
    password_masked: str = "••••••••"
    password_plain: str | None = None
    pin_masked: str | None = None
    pin_plain: str | None = None
    recovery_codes_plain: str | None = None
    has_totp: bool = False
    totp_code: str | None = None
    totp_remaining: int | None = None
    api_keys: list[ApiKeyItem] = []
    env_variables: list[EnvVarItem] = []
    is_deleted: bool = False
    created_at: Any = None
    updated_at: Any = None

class TotpSetupRequest(BaseModel):
    totp_secret: str

class TotpResponse(BaseModel):
    code: str
    remaining_seconds: int

class PwnedCheckRequest(BaseModel):
    password: str | None = None
    platform_id: str | None = None

class PwnedCheckResponse(BaseModel):
    is_pwned: bool
    pwned_count: int
    severity: str
    message: str

# Payment Method
class PaymentMethodBase(BaseModel):
    issuer: str
    alias: str
    last_four: str
    expiry_month: str | None = None
    expiry_year: str | None = None
    billing_notes: str | None = None

class PaymentMethodCreate(PaymentMethodBase):
    card_number: str | None = None
    cvv: str | None = None

class PaymentMethodUpdate(BaseModel):
    issuer: str | None = None
    alias: str | None = None
    last_four: str | None = None
    card_number: str | None = None
    expiry_month: str | None = None
    expiry_year: str | None = None
    cvv: str | None = None
    billing_notes: str | None = None

class PaymentMethodResponse(PaymentMethodBase):
    id: str
    card_number_masked: str = "•••• •••• •••• "
    card_number_plain: str | None = None
    cvv_plain: str | None = None
    linked_subscriptions_count: int = 0
    is_deleted: bool = False
    created_at: Any = None
    updated_at: Any = None

# Graph
class GraphNode(BaseModel):
    id: str
    entity_id: str | None = None
    label: str
    type: str  # email, platform, payment, prospect
    sub_type: str | None = None  # provider, access_type, etc.
    icon: str | None = None
    status: str | None = None
    is_critical_failure_point: bool = False
    metrics: dict[str, Any] = {}

class GraphLink(BaseModel):
    source: str
    target: str
    type: str  # child, recovery, payment
    is_cycle: bool = False
    label: str | None = None

class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    links: list[GraphLink]
    cycles_detected: list[list[str]] = []
    critical_nodes: list[str] = []

# Exchange Rate
class ExchangeRateResponse(BaseModel):
    base_currency: str
    target_currency: str
    rate: float
    is_manual: bool
    updated_at: Any

class ExchangeRateUpdate(BaseModel):
    rate: float
    is_manual: bool = True

# Settings
class SettingsResponse(BaseModel):
    vault_timeout_minutes: int
    clipboard_clear_seconds: int
    allow_reveal_passwords: bool
    search_hotkey: str
    accent_color: str = "#6366f1"
    canvas_style: str = "dot-grid"

class SettingsUpdate(BaseModel):
    vault_timeout_minutes: int | None = None
    clipboard_clear_seconds: int | None = None
    allow_reveal_passwords: bool | None = None
    search_hotkey: str | None = None
    accent_color: str | None = None
    canvas_style: str | None = None
    new_master_password: str | None = None

# Security Health & Audit
class PasswordReuseGroup(BaseModel):
    password_masked: str
    count: int
    entities: list[dict[str, str]]  # [{"id": "...", "name": "...", "type": "email|platform"}]

class SecurityAuditResponse(BaseModel):
    health_score: int  # 0 to 100
    total_accounts: int
    vulnerable_accounts_count: int
    reused_passwords_count: int
    weak_passwords_count: int
    no_2fa_emails_count: int
    stale_passwords_count: int
    reuse_groups: list[PasswordReuseGroup]
    weak_accounts: list[dict[str, Any]]
    unprotected_emails: list[dict[str, Any]]

class EmergencyKitResponse(BaseModel):
    generated_at: str
    vault_id: str
    master_salt: str
    total_emails: int
    total_platforms: int
    root_emails: list[dict[str, Any]]
    recovery_chains: list[dict[str, str]]
    instructions: list[str]

# Prospects / Demos CRM
class ProspectBase(BaseModel):
    company_name: str
    contact_name: str | None = None
    contact_email: str | None = None
    email_id: str | None = None
    specific_alias: str | None = None
    workflow_type: str = "demo_first"  # demo_first, direct_quote
    status: str = "demo_creada"  # demo_creada, primer_contacto, en_cotizacion, respondido, tiempo_agotado
    demo_url: str | None = None
    whatsapp: str | None = None
    phones: str | None = None
    maps_url: str | None = None
    social_links: str | None = None
    notes: str | None = None
    tags: list[TagItem] = []
    started_at: str | None = None
    sla_hours: float = 48.0

class ProspectCreate(ProspectBase):
    pass

class ProspectUpdate(BaseModel):
    company_name: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    email_id: str | None = None
    specific_alias: str | None = None
    workflow_type: str | None = None
    status: str | None = None
    demo_url: str | None = None
    whatsapp: str | None = None
    phones: str | None = None
    maps_url: str | None = None
    social_links: str | None = None
    notes: str | None = None
    tags: list[TagItem] | None = None
    started_at: str | None = None
    sla_hours: float | None = None
    responded_at: str | None = None
    response_time_seconds: int | None = None
    met_sla: bool | None = None

class ProspectResponse(ProspectBase):
    id: str
    email_address: str | None = None
    email_provider: str | None = None
    started_at: Any = None
    responded_at: Any = None
    response_time_seconds: int | None = None
    met_sla: bool | None = None
    elapsed_seconds: int = 0
    sla_seconds: int = 172800
    sla_status: str = "en_tiempo"  # en_tiempo, cumplido, vencido
    is_deleted: bool = False
    created_at: Any = None
    updated_at: Any = None

