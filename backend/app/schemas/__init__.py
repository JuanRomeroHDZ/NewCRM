from typing import Any
from datetime import date
import math
from pydantic import BaseModel, EmailStr, Field, field_validator

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
    budget_cap_amount: float = 0.0
    budget_cap_currency: str = "MXN"
    password_rotation_days_root: int = 90
    password_rotation_days_secondary: int = 180
    trash_retention_days: int = 0
    max_followup_attempts: int = 3

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
    scope: str = "business"

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
    scope: str | None = None

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
    email_id: str | None = None
    prospect_id: str | None = None
    project_id: str | None = None
    ownership_type: str = "own"  # own, client, independent
    scope: str = "business"  # business, personal, shared
    business_share_percent: float = 100.0
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
    prospect_id: str | None = None
    project_id: str | None = None
    ownership_type: str | None = None
    scope: str | None = None
    business_share_percent: float | None = None
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
    scope: str = "business"
    expiry_month: str | None = None
    expiry_year: str | None = None
    billing_notes: str | None = None

class PaymentMethodCreate(PaymentMethodBase):
    card_number: str | None = None

class PaymentMethodUpdate(BaseModel):
    issuer: str | None = None
    alias: str | None = None
    last_four: str | None = None
    scope: str | None = None
    card_number: str | None = None
    expiry_month: str | None = None
    expiry_year: str | None = None
    billing_notes: str | None = None

class PaymentMethodResponse(PaymentMethodBase):
    id: str
    card_number_masked: str = "•••• •••• •••• "
    card_number_plain: str | None = None
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
    module: str | None = "vault"
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
    synced: bool = True
    source: str | None = None

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
    budget_cap_amount: float = 0.0
    budget_cap_currency: str = "MXN"
    password_rotation_days_root: int = 90
    password_rotation_days_secondary: int = 180
    trash_retention_days: int = 0
    max_followup_attempts: int = 3

class SettingsUpdate(BaseModel):
    vault_timeout_minutes: int | None = None
    clipboard_clear_seconds: int | None = None
    allow_reveal_passwords: bool | None = None
    search_hotkey: str | None = None
    accent_color: str | None = None
    canvas_style: str | None = None
    budget_cap_amount: float | None = None
    budget_cap_currency: str | None = None
    password_rotation_days_root: int | None = None
    password_rotation_days_secondary: int | None = None
    trash_retention_days: int | None = None
    max_followup_attempts: int | None = None
    current_master_password: str | None = None
    new_master_password: str | None = None

# Billing Record History
class BillingRecordResponse(BaseModel):
    id: str
    platform_id: str
    platform_name: str
    amount: float
    currency: str
    billing_cycle: str
    charged_date: str
    payment_method_id: str | None = None
    created_at: Any = None

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
    expiring_api_keys_count: int = 0
    expired_api_keys_count: int = 0
    password_rotation_days_root: int = 90
    password_rotation_days_secondary: int = 180
    reuse_groups: list[PasswordReuseGroup]
    weak_accounts: list[dict[str, Any]]
    unprotected_emails: list[dict[str, Any]]
    stale_accounts: list[dict[str, Any]] = []
    api_key_alerts: list[dict[str, Any]] = []

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
    scope: str = "business"
    workflow_type: str = "demo_first"  # demo_first, direct_quote
    status: str = "demo_creada"  # demo_creada, primer_contacto, en_cotizacion, respondido, tiempo_agotado, archivado_frio
    demo_url: str | None = None
    estimated_value: float = 0.0
    currency: str = "MXN"  # MXN, USD
    billing_type: str = "one_time"  # one_time, monthly_retainer
    whatsapp: str | None = None
    phones: str | None = None
    maps_url: str | None = None
    social_links: str | None = None
    notes: str | None = None
    tags: list[TagItem] = []
    started_at: str | None = None
    sla_hours: float = 48.0
    followup_sla_hours: float = 48.0
    max_followup_attempts: int = 3

class ProspectCreate(ProspectBase):
    @field_validator('company_name')
    @classmethod
    def validate_company_name(cls, value: str) -> str:
        value = value.strip()
        if not value or len(value) > 180:
            raise ValueError('El nombre debe contener entre 1 y 180 caracteres.')
        return value

class ProspectUpdate(BaseModel):
    company_name: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    email_id: str | None = None
    specific_alias: str | None = None
    scope: str | None = None
    workflow_type: str | None = None
    status: str | None = None
    demo_url: str | None = None
    estimated_value: float | None = None
    currency: str | None = None
    billing_type: str | None = None
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
    last_contacted_at: str | None = None
    followup_count: int | None = None
    last_contact_channel: str | None = None
    followup_sla_hours: float | None = None
    max_followup_attempts: int | None = None

    @field_validator('company_name')
    @classmethod
    def validate_company_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value or len(value) > 180:
            raise ValueError('El nombre debe contener entre 1 y 180 caracteres.')
        return value

class ProspectContactAttemptRequest(BaseModel):
    channel: str = Field(default="whatsapp", max_length=32)  # whatsapp, email, phone, template
    note: str | None = Field(default=None, max_length=500)
    auto_advance_status: bool = True
    followup_sla_hours: float | None = Field(default=48.0, ge=1.0, le=720.0)

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
    last_contacted_at: Any = None
    followup_count: int = 0
    last_contact_channel: str | None = None
    followup_sla_hours: float = 48.0
    followup_elapsed_seconds: int = 0
    followup_sla_seconds: int = 172800
    followup_remaining_seconds: int = 172800
    followup_status: str = "en_tiempo"  # en_tiempo, vencido, sin_iniciar, completado
    max_followup_attempts: int = 3
    needs_recontact: bool = False
    is_deleted: bool = False
    created_at: Any = None
    updated_at: Any = None


# Client Incomes / Pagos Recibidos
class FinancialInputValidation(BaseModel):
    @field_validator('amount', 'renewal_cost', 'client_charge_amount', 'charged_amount', check_fields=False)
    @classmethod
    def validate_amount(cls, value: float | None) -> float | None:
        if value is not None and (not math.isfinite(value) or value < 0):
            raise ValueError('El monto debe ser un número finito y no negativo.')
        return value

    @field_validator('business_share_percent', check_fields=False)
    @classmethod
    def validate_share(cls, value: float | None) -> float | None:
        if value is not None and (not math.isfinite(value) or not 0 <= value <= 100):
            raise ValueError('El porcentaje debe estar entre 0 y 100.')
        return value

    @field_validator('received_date', 'renewal_date', 'expense_date', check_fields=False)
    @classmethod
    def validate_date(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            if len(value) != 10 or date.fromisoformat(value).isoformat() != value:
                raise ValueError
        except ValueError:
            raise ValueError('La fecha debe ser válida y tener el formato AAAA-MM-DD.')
        return value


class ClientIncomeBase(BaseModel):
    prospect_id: str | None = None
    project_id: str | None = None
    ownership_type: str = "client"  # client, own, independent
    scope: str = "business"  # business, personal, shared
    business_share_percent: float = 100.0
    client_name: str
    concept: str
    category: str = "anticipo"  # open category
    amount: float = 0.0
    currency: str = "MXN"  # MXN, USD
    status: str = "cobrado"  # cobrado, pendiente
    received_date: str  # YYYY-MM-DD
    payment_method_label: str | None = None
    is_recurring: bool = False
    notes: str | None = None

class ClientIncomeCreate(FinancialInputValidation, ClientIncomeBase):
    pass

class ClientIncomeUpdate(FinancialInputValidation):
    prospect_id: str | None = None
    project_id: str | None = None
    ownership_type: str | None = None
    scope: str | None = None
    business_share_percent: float | None = None
    client_name: str | None = None
    concept: str | None = None
    category: str | None = None
    amount: float | None = None
    currency: str | None = None
    status: str | None = None
    received_date: str | None = None
    payment_method_label: str | None = None
    is_recurring: bool | None = None
    notes: str | None = None

class ClientIncomeResponse(ClientIncomeBase):
    id: str
    is_deleted: bool = False
    created_at: Any = None
    updated_at: Any = None


# Domain & Hosting Renewals Monitor
class DomainRenewalBase(BaseModel):
    prospect_id: str | None = None
    project_id: str | None = None
    platform_id: str | None = None
    ownership_type: str = "client"  # client, own, independent
    scope: str = "business"  # business, personal, shared
    business_share_percent: float = 100.0
    client_name: str
    domain_or_service: str
    service_type: str = "dominio"  # open service_type
    provider: str | None = None
    renewal_date: str  # YYYY-MM-DD
    renewal_cost: float = 0.0
    client_charge_amount: float = 0.0
    currency: str = "MXN"  # MXN, USD
    billing_cycle: str = "yearly"  # yearly, monthly
    paid_by: str = "client"  # me (Por mi cuenta), client (Por cuenta del cliente)
    status: str = "activo"  # activo, renovado, vencido, cancelado
    auto_renew: bool = False
    notes: str | None = None

class DomainRenewalCreate(FinancialInputValidation, DomainRenewalBase):
    pass

class DomainRenewalUpdate(FinancialInputValidation):
    prospect_id: str | None = None
    project_id: str | None = None
    platform_id: str | None = None
    ownership_type: str | None = None
    scope: str | None = None
    business_share_percent: float | None = None
    client_name: str | None = None
    domain_or_service: str | None = None
    service_type: str | None = None
    provider: str | None = None
    renewal_date: str | None = None
    renewal_cost: float | None = None
    client_charge_amount: float | None = None
    currency: str | None = None
    billing_cycle: str | None = None
    paid_by: str | None = None
    status: str | None = None
    auto_renew: bool | None = None
    notes: str | None = None

class AdvanceRenewalRequest(FinancialInputValidation):
    create_income: bool = False
    charged_amount: float | None = None
    charged_currency: str | None = None
    payment_method_label: str | None = None
    income_status: str = "cobrado"

class DomainRenewalResponse(DomainRenewalBase):
    id: str
    days_remaining: int = 0
    expiry_semaphore: str = "en_orden"  # en_orden, proximo, urgente, vencido, cancelado
    created_income_id: str | None = None
    margin_amount: float | None = None
    is_deleted: bool = False
    created_at: Any = None
    updated_at: Any = None


# One-Time Expenses / Gastos Únicos
class OneTimeExpenseBase(BaseModel):
    concept: str
    category: str = "Hardware / Equipo"
    amount: float = 0.0
    currency: str = "MXN"
    expense_date: str  # YYYY-MM-DD
    scope: str = "business"  # business, personal, shared
    business_share_percent: float = 100.0
    ownership_type: str = "own"  # own, client, independent
    vendor: str | None = None
    payment_method_label: str | None = None
    prospect_id: str | None = None
    project_id: str | None = None
    notes: str | None = None

class OneTimeExpenseCreate(FinancialInputValidation, OneTimeExpenseBase):
    pass

class OneTimeExpenseUpdate(FinancialInputValidation):
    concept: str | None = None
    category: str | None = None
    amount: float | None = None
    currency: str | None = None
    expense_date: str | None = None
    scope: str | None = None
    business_share_percent: float | None = None
    ownership_type: str | None = None
    vendor: str | None = None
    payment_method_label: str | None = None
    prospect_id: str | None = None
    project_id: str | None = None
    notes: str | None = None

class OneTimeExpenseResponse(OneTimeExpenseBase):
    id: str
    is_deleted: bool = False
    created_at: Any = None
    updated_at: Any = None


# Internal Projects / Proyectos Propios e Infraestructura
class InternalProjectBase(BaseModel):
    name: str
    category: str = "Sistema / SaaS"
    status: str = "en_desarrollo"  # idea, en_desarrollo, en_produccion, pausado
    scope: str = "business"  # business, personal, shared
    email_id: str | None = None
    production_url: str | None = None
    repo_url: str | None = None
    tech_stack: str | None = None
    monthly_maintenance_cost: float = 0.0
    currency: str = "MXN"
    linked_platform_ids: list[str] = []
    linked_domain_ids: list[str] = []
    tags: list[TagItem] = []
    notes: str | None = None

class InternalProjectCreate(InternalProjectBase):
    pass

class InternalProjectUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    status: str | None = None
    scope: str | None = None
    email_id: str | None = None
    production_url: str | None = None
    repo_url: str | None = None
    tech_stack: str | None = None
    monthly_maintenance_cost: float | None = None
    currency: str | None = None
    linked_platform_ids: list[str] | None = None
    linked_domain_ids: list[str] | None = None
    tags: list[TagItem] | None = None
    notes: str | None = None

class InternalProjectResponse(InternalProjectBase):
    id: str
    email_address: str | None = None
    is_deleted: bool = False
    created_at: Any = None
    updated_at: Any = None


# Secure Resources & Free Encrypted Notes
class SecureResourceBase(BaseModel):
    title: str
    resource_type: str = "nota_segura"  # env_file, ssh_key, backup_codes, software_license, nota_segura, custom
    scope: str = "business"  # business, personal, shared
    ownership_type: str = "own"  # own, client, independent
    content: str | None = None
    email_id: str | None = None
    platform_id: str | None = None
    prospect_id: str | None = None
    project_id: str | None = None
    tags: list[TagItem] = []
    notes: str | None = None

class SecureResourceCreate(SecureResourceBase):
    pass

class SecureResourceUpdate(BaseModel):
    title: str | None = None
    resource_type: str | None = None
    scope: str | None = None
    ownership_type: str | None = None
    content: str | None = None
    email_id: str | None = None
    platform_id: str | None = None
    prospect_id: str | None = None
    project_id: str | None = None
    tags: list[TagItem] | None = None
    notes: str | None = None

class SecureResourceResponse(SecureResourceBase):
    id: str
    content_masked: str = "••••••••••••••••"
    is_deleted: bool = False
    created_at: Any = None
    updated_at: Any = None

# Núcleo / Core Schemas
class UserLoginRequest(BaseModel):
    username_or_email: str
    password: str
    totp_code: str | None = None

class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    full_name: str
    role: str
    is_active: bool
    is_totp_enabled: bool
    must_change_password: bool
    created_at: Any = None

class UserLoginResponse(BaseModel):
    token: str
    user: UserResponse
    expires_in_minutes: int

class UserCreateRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    email: str = Field(..., pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    full_name: str = Field(..., min_length=2, max_length=128)
    role: str = Field("seller", pattern="^(owner|business_admin|seller|readonly)$")

class UserCreateResponse(UserResponse):
    temporary_password: str

class UserUpdateRequest(BaseModel):
    full_name: str | None = None
    role: str | None = Field(None, pattern="^(owner|business_admin|seller|readonly)$")
    is_active: bool | None = None
    unlock: bool = False

class TotpSetupResponse(BaseModel):
    secret: str
    recovery_codes: list[str]

class TotpVerifyRequest(BaseModel):
    code: str

class CatalogUpdateRequest(BaseModel):
    items: list[Any]

class ConfigParamUpdateRequest(BaseModel):
    value: Any
    description: str | None = None

class JobResponse(BaseModel):
    id: str
    queue_name: str
    job_type: str
    status: str
    attempts: int
    max_attempts: int
    scheduled_at: Any = None
    last_error: str | None = None
    created_at: Any = None
