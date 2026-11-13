from typing import Annotated, Any
from datetime import date
import math
import re
from urllib.parse import urlsplit
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from .validators import (
    normalize_and_validate_card_digits,
    validate_calendar_date,
    validate_card_consistency,
    validate_phone_list,
    validate_rfc_input,
    validate_service_dates_order,
    validate_single_phone,
)

def validate_email_input(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
        raise ValueError('Ingresa un correo electrónico válido.')
    return value

def validate_web_url_input(value: str | None) -> str | None:
    if value is None or value == '':
        return value
    try:
        parts = urlsplit(value)
        if parts.scheme.lower() not in ('http', 'https') or not parts.hostname or parts.username or parts.password:
            raise ValueError
        _ = parts.port
    except ValueError:
        raise ValueError('Ingresa una dirección web válida que comience con http o https.')
    return value

def validate_nonblank_input(value: str | None, error_message: str = 'El campo no puede quedar vacío.') -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        raise ValueError(error_message)
    return value


def validate_finite_number_input(
    value: float | int | None,
    error_message: str = 'Ingresa un número finito válido.',
) -> float | int | None:
    if value is None:
        return None
    if not math.isfinite(float(value)):
        raise ValueError(error_message)
    return value

def validate_expiry_month_input(value: str | None) -> str | None:
    if value is None or value == '':
        return value
    if not re.fullmatch(r'\d{1,2}', value) or not 1 <= int(value) <= 12:
        raise ValueError('El mes debe estar entre 1 y 12.')
    return value

def validate_expiry_year_input(value: str | None) -> str | None:
    if value is None or value == '':
        return value
    if not (re.fullmatch(r'\d{2}', value) or (re.fullmatch(r'\d{4}', value) and 1900 <= int(value) <= 2199)):
        raise ValueError('El año debe tener dos o cuatro dígitos.')
    return value

# Auth & Vault
class MasterPasswordSetup(BaseModel):
    master_password: str = Field(..., min_length=8, max_length=256)

class VaultUnlockRequest(BaseModel):
    master_password: str = Field(..., min_length=1, max_length=256)

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

class BackupCodeInput(BackupCodeItem):
    code: str = Field(max_length=256)

class SecurityQuestionInput(SecurityQuestionItem):
    question: str = Field(max_length=500)
    answer: str = Field(max_length=1000)

EmailAliasInput = Annotated[str, Field(max_length=255)]

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
    address: str = Field(..., min_length=3, max_length=255)
    provider: str = Field(default="Google", max_length=64)
    inbox_url: str | None = Field(default=None, max_length=512)
    icon: str | None = Field(default=None, max_length=1000000)
    notes: str | None = Field(default=None, max_length=5000)
    recovery_email_id: str | None = Field(default=None, max_length=36)
    recovery_phone: str | None = Field(default=None, max_length=64)
    two_factor_method: str = Field(default="none", max_length=32)
    scope: str = Field(default="business", max_length=32)
    password: str | None = Field(default=None, max_length=256)
    aliases: list[EmailAliasInput] = Field(default_factory=list, max_length=100)
    backup_codes: list[BackupCodeInput] = Field(default_factory=list, max_length=100)
    security_questions: list[SecurityQuestionInput] = Field(default_factory=list, max_length=100)

    _valid_address = field_validator('address')(validate_email_input)
    _valid_inbox_url = field_validator('inbox_url')(validate_web_url_input)

class EmailUpdate(BaseModel):
    address: str | None = Field(default=None, min_length=3, max_length=255)
    provider: str | None = Field(default=None, max_length=64)
    inbox_url: str | None = Field(default=None, max_length=512)
    icon: str | None = Field(default=None, max_length=1000000)
    notes: str | None = Field(default=None, max_length=5000)
    password: str | None = Field(default=None, max_length=256)
    recovery_email_id: str | None = Field(default=None, max_length=36)
    recovery_phone: str | None = Field(default=None, max_length=64)
    two_factor_method: str | None = Field(default=None, max_length=32)
    backup_codes: list[BackupCodeInput] | None = Field(default=None, max_length=100)
    security_questions: list[SecurityQuestionInput] | None = Field(default=None, max_length=100)
    aliases: list[EmailAliasInput] | None = Field(default=None, max_length=100)
    scope: str | None = Field(default=None, max_length=32)

    _valid_address = field_validator('address')(validate_email_input)
    _valid_inbox_url = field_validator('inbox_url')(validate_web_url_input)

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

class ApiKeyInput(ApiKeyItem):
    id: str = Field(max_length=64)
    label: str = Field(max_length=100)
    key: str | None = Field(default=None, max_length=500)
    key_masked: str = Field(default="••••••••••••••••", max_length=128)
    created_at: str | None = Field(default=None, max_length=64)
    expires_at: str | None = Field(default=None, max_length=64)

class EnvVarInput(EnvVarItem):
    key: str = Field(max_length=100)
    value: str | None = Field(default=None, max_length=1000)
    value_masked: str = Field(default="••••••••", max_length=128)

class TagInput(TagItem):
    name: str = Field(min_length=1, max_length=50)
    color: str = Field(default="#6366f1", max_length=32)

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
    name: str = Field(..., min_length=1, max_length=128)
    email_id: str | None = Field(default=None, max_length=36)
    prospect_id: str | None = Field(default=None, max_length=36)
    project_id: str | None = Field(default=None, max_length=36)
    payment_method_id: str | None = Field(default=None, max_length=36)
    specific_alias: str | None = Field(default=None, max_length=255)
    ownership_type: str = Field(default="own", max_length=32)
    scope: str = Field(default="business", max_length=32)
    icon_type: str = Field(default="catalog", max_length=32)
    access_type: str = Field(default="own_password", max_length=32)
    subscription_status: str = Field(default="active", max_length=32)
    currency: str = Field(default="MXN", max_length=8)
    billing_cycle: str = Field(default="monthly", max_length=32)
    login_url: str | None = Field(default=None, max_length=512)
    username: str | None = Field(default=None, max_length=128)
    notes: str | None = Field(default=None, max_length=5000)
    icon_url: str | None = Field(default=None, max_length=1000000)
    start_date: str | None = Field(default=None, max_length=32)
    next_billing_date: str | None = Field(default=None, max_length=32)
    trial_end_date: str | None = Field(default=None, max_length=32)
    subscription_cost: float = Field(default=0.0, ge=0, le=100000000, allow_inf_nan=False)
    business_share_percent: float = Field(default=100.0, ge=0, le=100, allow_inf_nan=False)
    password: str | None = Field(default=None, max_length=256)
    pin: str | None = Field(default=None, max_length=64)
    recovery_codes: str | None = Field(default=None, max_length=5000)
    totp_secret: str | None = Field(default=None, max_length=128)
    api_keys: list[ApiKeyInput] = Field(default_factory=list, max_length=100)
    env_variables: list[EnvVarInput] = Field(default_factory=list, max_length=100)
    tags: list[TagInput] = Field(default_factory=list, max_length=100)

    _valid_name = field_validator('name')(validate_nonblank_input)
    _valid_login_url = field_validator('login_url')(validate_web_url_input)
    _valid_dates = field_validator('start_date', 'next_billing_date', 'trial_end_date')(validate_calendar_date)

    @model_validator(mode='after')
    def check_service_dates_order(self):
        validate_service_dates_order(self.start_date, self.next_billing_date, self.trial_end_date)
        return self

class PlatformUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    email_id: str | None = Field(default=None, max_length=36)
    prospect_id: str | None = Field(default=None, max_length=36)
    project_id: str | None = Field(default=None, max_length=36)
    ownership_type: str | None = Field(default=None, max_length=32)
    scope: str | None = Field(default=None, max_length=32)
    business_share_percent: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    specific_alias: str | None = Field(default=None, max_length=255)
    login_url: str | None = Field(default=None, max_length=512)
    username: str | None = Field(default=None, max_length=128)
    notes: str | None = Field(default=None, max_length=5000)
    icon_url: str | None = Field(default=None, max_length=1000000)
    icon_type: str | None = Field(default=None, max_length=32)
    access_type: str | None = Field(default=None, max_length=32)
    password: str | None = Field(default=None, max_length=256)
    pin: str | None = Field(default=None, max_length=64)
    recovery_codes: str | None = Field(default=None, max_length=5000)
    totp_secret: str | None = Field(default=None, max_length=128)
    api_keys: list[ApiKeyInput] | None = Field(default=None, max_length=100)
    env_variables: list[EnvVarInput] | None = Field(default=None, max_length=100)
    subscription_status: str | None = Field(default=None, max_length=32)
    subscription_cost: float | None = Field(default=None, ge=0, le=100000000, allow_inf_nan=False)
    currency: str | None = Field(default=None, max_length=8)
    billing_cycle: str | None = Field(default=None, max_length=32)
    start_date: str | None = Field(default=None, max_length=32)
    next_billing_date: str | None = Field(default=None, max_length=32)
    trial_end_date: str | None = Field(default=None, max_length=32)
    payment_method_id: str | None = Field(default=None, max_length=36)
    tags: list[TagInput] | None = Field(default=None, max_length=100)

    _valid_name = field_validator('name')(validate_nonblank_input)
    _valid_login_url = field_validator('login_url')(validate_web_url_input)
    _valid_dates = field_validator('start_date', 'next_billing_date', 'trial_end_date')(validate_calendar_date)

    @model_validator(mode='after')
    def check_service_dates_order(self):
        validate_service_dates_order(self.start_date, self.next_billing_date, self.trial_end_date)
        return self

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
    totp_secret: str = Field(..., min_length=1, max_length=128)

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
    issuer: str = Field(..., min_length=1, max_length=64)
    alias: str = Field(..., min_length=1, max_length=128)
    last_four: str = Field(..., pattern=r'^\d{4}$')
    scope: str = Field(default="business", max_length=32)
    expiry_month: str | None = Field(default=None, max_length=4)
    expiry_year: str | None = Field(default=None, max_length=4)
    billing_notes: str | None = Field(default=None, max_length=5000)
    card_number: str | None = Field(default=None, max_length=32)

    _valid_name = field_validator('issuer', 'alias')(validate_nonblank_input)
    _valid_expiry_month = field_validator('expiry_month')(validate_expiry_month_input)
    _valid_expiry_year = field_validator('expiry_year')(validate_expiry_year_input)
    _valid_card_number = field_validator('card_number')(normalize_and_validate_card_digits)

    @model_validator(mode='after')
    def check_card_fields(self):
        validate_card_consistency(
            self.card_number,
            self.last_four,
            self.expiry_month,
            self.expiry_year,
            require_complete_expiry=True,
        )
        return self

class PaymentMethodUpdate(BaseModel):
    issuer: str | None = Field(default=None, min_length=1, max_length=64)
    alias: str | None = Field(default=None, min_length=1, max_length=128)
    last_four: str | None = Field(default=None, pattern=r'^\d{4}$')
    scope: str | None = Field(default=None, max_length=32)
    card_number: str | None = Field(default=None, max_length=32)
    expiry_month: str | None = Field(default=None, max_length=4)
    expiry_year: str | None = Field(default=None, max_length=4)
    billing_notes: str | None = Field(default=None, max_length=5000)

    _valid_name = field_validator('issuer', 'alias')(validate_nonblank_input)
    _valid_expiry_month = field_validator('expiry_month')(validate_expiry_month_input)
    _valid_expiry_year = field_validator('expiry_year')(validate_expiry_year_input)
    _valid_card_number = field_validator('card_number')(normalize_and_validate_card_digits)

    @model_validator(mode='after')
    def check_card_fields(self):
        validate_card_consistency(
            self.card_number,
            self.last_four,
            self.expiry_month,
            self.expiry_year,
            require_complete_expiry=False,
        )
        return self

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
    vault_timeout_minutes: int | None = Field(default=None, ge=1, le=1440)
    clipboard_clear_seconds: int | None = Field(default=None, ge=0, le=3600)
    allow_reveal_passwords: bool | None = None
    search_hotkey: str | None = Field(default=None, max_length=32)
    accent_color: str | None = Field(default=None, max_length=32)
    canvas_style: str | None = Field(default=None, max_length=32)
    budget_cap_amount: float | None = Field(default=None, ge=0, le=100000000, allow_inf_nan=False)
    budget_cap_currency: str | None = Field(default=None, max_length=8)
    password_rotation_days_root: int | None = Field(default=None, ge=1, le=3650)
    password_rotation_days_secondary: int | None = Field(default=None, ge=1, le=3650)
    trash_retention_days: int | None = Field(default=None, ge=0, le=3650)
    max_followup_attempts: int | None = Field(default=None, ge=1, le=10)
    current_master_password: str | None = None
    new_master_password: str | None = Field(default=None, max_length=256)

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
    status: str = "demo_creada"  # nuevo, demo_creada, primer_contacto, en_cotizacion, respondido, tiempo_agotado, archivado_frio
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
    contact_name: str | None = Field(default=None, max_length=128)
    contact_email: str | None = Field(default=None, max_length=255)
    email_id: str | None = Field(default=None, max_length=36)
    specific_alias: str | None = Field(default=None, max_length=255)
    scope: str = Field(default="business", max_length=32)
    workflow_type: str = Field(default="demo_first", max_length=32)
    status: str = Field(default="demo_creada", max_length=32)
    currency: str = Field(default="MXN", max_length=8)
    billing_type: str = Field(default="one_time", max_length=32)
    started_at: str | None = Field(default=None, max_length=64)
    demo_url: str | None = Field(default=None, max_length=512)
    maps_url: str | None = Field(default=None, max_length=512)
    whatsapp: str | None = Field(default=None, max_length=64)
    phones: str | None = Field(default=None, max_length=500)
    social_links: str | None = Field(default=None, max_length=1000)
    notes: str | None = Field(default=None, max_length=5000)
    tags: list[TagInput] = Field(default_factory=list, max_length=100)
    estimated_value: float = Field(default=0, ge=0, le=100000000, allow_inf_nan=False)
    sla_hours: float = Field(default=48, ge=0, le=87600, allow_inf_nan=False)
    followup_sla_hours: float = Field(default=48, ge=0, le=87600, allow_inf_nan=False)
    max_followup_attempts: int = Field(default=3, ge=1, le=100)

    _valid_contact_email = field_validator('contact_email')(validate_email_input)
    _valid_web_urls = field_validator('demo_url', 'maps_url')(validate_web_url_input)
    _valid_whatsapp = field_validator('whatsapp')(validate_single_phone)
    _valid_phones = field_validator('phones')(validate_phone_list)

    @field_validator('company_name')
    @classmethod
    def validate_company_name(cls, value: str) -> str:
        value = value.strip()
        if not value or len(value) > 180:
            raise ValueError('El nombre debe contener entre 1 y 180 caracteres.')
        return value

class ProspectUpdate(BaseModel):
    company_name: str | None = None
    contact_name: str | None = Field(default=None, max_length=128)
    contact_email: str | None = Field(default=None, max_length=255)
    email_id: str | None = Field(default=None, max_length=36)
    specific_alias: str | None = Field(default=None, max_length=255)
    scope: str | None = Field(default=None, max_length=32)
    workflow_type: str | None = Field(default=None, max_length=32)
    status: str | None = Field(default=None, max_length=32)
    demo_url: str | None = Field(default=None, max_length=512)
    estimated_value: float | None = Field(default=None, ge=0, le=100000000, allow_inf_nan=False)
    currency: str | None = Field(default=None, max_length=8)
    billing_type: str | None = Field(default=None, max_length=32)
    whatsapp: str | None = Field(default=None, max_length=64)
    phones: str | None = Field(default=None, max_length=500)
    maps_url: str | None = Field(default=None, max_length=512)
    social_links: str | None = Field(default=None, max_length=1000)
    notes: str | None = Field(default=None, max_length=5000)
    tags: list[TagInput] | None = Field(default=None, max_length=100)
    started_at: str | None = Field(default=None, max_length=64)
    sla_hours: float | None = Field(default=None, ge=0, le=87600, allow_inf_nan=False)
    responded_at: str | None = Field(default=None, max_length=64)
    response_time_seconds: int | None = Field(default=None, ge=0, le=2147483647)
    met_sla: bool | None = None
    last_contacted_at: str | None = Field(default=None, max_length=64)
    followup_count: int | None = Field(default=None, ge=0, le=2147483647)
    last_contact_channel: str | None = Field(default=None, max_length=32)
    followup_sla_hours: float | None = Field(default=None, ge=0, le=87600, allow_inf_nan=False)
    max_followup_attempts: int | None = Field(default=None, ge=1, le=100)

    _valid_contact_email = field_validator('contact_email')(validate_email_input)
    _valid_web_urls = field_validator('demo_url', 'maps_url')(validate_web_url_input)
    _valid_whatsapp = field_validator('whatsapp')(validate_single_phone)
    _valid_phones = field_validator('phones')(validate_phone_list)

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
        if value is not None and (not math.isfinite(value) or value < 0 or value > 100000000):
            raise ValueError('El monto debe estar entre 0 y 100,000,000.')
        return value

    @field_validator(
        'client_name', 'concept', 'domain_or_service', 'category', 'service_type',
        'provider', 'vendor', 'payment_method_label', 'notes', 'currency',
        'charged_currency', 'scope', 'ownership_type', 'status', 'income_status',
        'billing_cycle', 'paid_by', 'prospect_id', 'project_id', 'platform_id',
        check_fields=False,
    )
    @classmethod
    def validate_text_size(cls, value: str | None, info) -> str | None:
        if value is None:
            return None
        limits = {
            'client_name': 180, 'concept': 180, 'domain_or_service': 255,
            'category': 64, 'service_type': 64, 'provider': 128, 'vendor': 128,
            'payment_method_label': 64, 'notes': 5000, 'currency': 8,
            'charged_currency': 8, 'scope': 32, 'ownership_type': 32,
            'status': 32, 'income_status': 32, 'billing_cycle': 32, 'paid_by': 32,
            'prospect_id': 36, 'project_id': 36, 'platform_id': 36,
        }
        if len(value) > limits[info.field_name]:
            raise ValueError(f'El campo admite hasta {limits[info.field_name]} caracteres.')
        if info.field_name in {'client_name', 'concept', 'domain_or_service'} and not value.strip():
            raise ValueError('El campo no puede quedar vacío.')
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
    name: str = Field(..., min_length=1, max_length=180)
    category: str = Field(default="Sistema / SaaS", min_length=1, max_length=64)
    status: str = Field(default="en_desarrollo", pattern="^(idea|en_desarrollo|en_produccion|pausado)$")
    scope: str = Field(default="business", pattern="^(business|personal|shared)$")
    email_id: str | None = Field(default=None, max_length=36)
    production_url: str | None = Field(default=None, max_length=512)
    repo_url: str | None = Field(default=None, max_length=512)
    tech_stack: str | None = Field(default=None, max_length=500)
    monthly_maintenance_cost: float = Field(default=0.0, ge=0, le=100000000, allow_inf_nan=False)
    currency: str = Field(default="MXN", pattern="^(MXN|USD)$")
    linked_platform_ids: list[str] = Field(default_factory=list, max_length=100)
    linked_domain_ids: list[str] = Field(default_factory=list, max_length=100)
    tags: list[TagInput] = Field(default_factory=list, max_length=100)
    notes: str | None = Field(default=None, max_length=10000)

    _valid_name = field_validator('name', 'category')(validate_nonblank_input)
    _valid_urls = field_validator('production_url', 'repo_url')(validate_web_url_input)

class InternalProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    category: str | None = Field(default=None, min_length=1, max_length=64)
    status: str | None = Field(default=None, pattern="^(idea|en_desarrollo|en_produccion|pausado)$")
    scope: str | None = Field(default=None, pattern="^(business|personal|shared)$")
    email_id: str | None = Field(default=None, max_length=36)
    production_url: str | None = Field(default=None, max_length=512)
    repo_url: str | None = Field(default=None, max_length=512)
    tech_stack: str | None = Field(default=None, max_length=500)
    monthly_maintenance_cost: float | None = Field(default=None, ge=0, le=100000000, allow_inf_nan=False)
    currency: str | None = Field(default=None, pattern="^(MXN|USD)$")
    linked_platform_ids: list[str] | None = Field(default=None, max_length=100)
    linked_domain_ids: list[str] | None = Field(default=None, max_length=100)
    tags: list[TagInput] | None = Field(default=None, max_length=100)
    notes: str | None = Field(default=None, max_length=10000)

    _valid_name = field_validator('name', 'category')(validate_nonblank_input)
    _valid_urls = field_validator('production_url', 'repo_url')(validate_web_url_input)

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
    title: str = Field(..., min_length=1, max_length=180)
    resource_type: str = Field(default="nota_segura", max_length=64)
    scope: str = Field(default="business", max_length=32)
    ownership_type: str = Field(default="own", max_length=32)
    content: str | None = Field(default=None, max_length=1000000)
    email_id: str | None = Field(default=None, max_length=36)
    platform_id: str | None = Field(default=None, max_length=36)
    prospect_id: str | None = Field(default=None, max_length=36)
    project_id: str | None = Field(default=None, max_length=36)
    tags: list[TagInput] = Field(default_factory=list, max_length=100)
    notes: str | None = Field(default=None, max_length=5000)

    _valid_title = field_validator('title')(validate_nonblank_input)

class SecureResourceUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=180)
    resource_type: str | None = Field(default=None, max_length=64)
    scope: str | None = Field(default=None, max_length=32)
    ownership_type: str | None = Field(default=None, max_length=32)
    content: str | None = Field(default=None, max_length=1000000)
    email_id: str | None = Field(default=None, max_length=36)
    platform_id: str | None = Field(default=None, max_length=36)
    prospect_id: str | None = Field(default=None, max_length=36)
    project_id: str | None = Field(default=None, max_length=36)
    tags: list[TagInput] | None = Field(default=None, max_length=100)
    notes: str | None = Field(default=None, max_length=5000)

    _valid_title = field_validator('title')(validate_nonblank_input)

class SecureResourceResponse(SecureResourceBase):
    id: str
    content_masked: str = "••••••••••••••••"
    is_deleted: bool = False
    created_at: Any = None
    updated_at: Any = None

# Núcleo / Core Schemas
class UserLoginRequest(BaseModel):
    username_or_email: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=1, max_length=256)
    totp_code: str | None = Field(default=None, min_length=4, max_length=32)

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
    username: str = Field(..., min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9._-]+$")
    email: str = Field(..., max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    full_name: str = Field(..., min_length=2, max_length=128)
    role: str = Field("seller", pattern="^(owner|business_admin|seller|readonly)$")

    @field_validator("full_name")
    @classmethod
    def check_full_name(cls, value: str) -> str:
        return validate_nonblank_input(value, "Ingresa el nombre completo.")

class UserCreateResponse(UserResponse):
    temporary_password: str

class UserUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=128)
    role: str | None = Field(None, pattern="^(owner|business_admin|seller|readonly)$")
    is_active: bool | None = None
    unlock: bool = False

    @field_validator("full_name")
    @classmethod
    def check_full_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_nonblank_input(value, "El nombre completo no puede estar vacío.")

class UserChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=256)
    new_password: str = Field(..., min_length=8, max_length=256)
    totp_code: str | None = Field(default=None, min_length=4, max_length=32)

class TotpSetupConfirmRequest(BaseModel):
    current_password: str | None = Field(default=None, min_length=1, max_length=256)

class TotpSetupResponse(BaseModel):
    secret: str
    recovery_codes: list[str]

class TotpVerifyRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=16, pattern=r"^\d{6,8}$")

class CatalogUpdateRequest(BaseModel):
    items: list[Any] = Field(..., max_length=500)

class ConfigParamUpdateRequest(BaseModel):
    value: Any
    description: str | None = Field(default=None, max_length=255)

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
