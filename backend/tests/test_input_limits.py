import math

import pytest
from pydantic import ValidationError

from app.schemas import (
    ClientIncomeCreate, DomainRenewalCreate, DomainRenewalUpdate, EmailCreate, EmailUpdate,
    PaymentMethodCreate, PaymentMethodUpdate, PlatformBase, PlatformCreate,
    PlatformUpdate, ProspectBase, ProspectCreate, ProspectUpdate, InternalProjectCreate,
    SecureResourceBase, SecureResourceCreate, SecureResourceUpdate, SettingsUpdate,
    TotpSetupRequest,
)


@pytest.mark.parametrize('model,payload', [
    (ProspectCreate, {'company_name': 'Empresa', 'contact_name': 'x' * 129}),
    (ProspectUpdate, {'demo_url': 'https://example.com/' + 'x' * 512}),
    (ProspectCreate, {'company_name': 'Empresa', 'contact_email': 'correo inválido'}),
    (ProspectUpdate, {'maps_url': 'javascript:alert(1)'}),
    (ProspectCreate, {'company_name': 'Empresa', 'estimated_value': math.inf}),
    (ProspectUpdate, {'estimated_value': -1}),
    (ProspectCreate, {'company_name': 'Empresa', 'currency': 'EUR'}),
    (ProspectUpdate, {'currency': 'EUR'}),
    (ProspectUpdate, {'sla_hours': 87601}),
    (EmailCreate, {'address': 'sin-arroba'}),
    (EmailUpdate, {'aliases': ['x' * 256]}),
    (PlatformCreate, {'name': '   '}),
    (PlatformUpdate, {'subscription_cost': math.nan}),
    (PlatformCreate, {'name': 'Cuenta', 'currency': 'EUR'}),
    (PlatformUpdate, {'currency': 'EUR'}),
    (PlatformCreate, {'name': 'Cuenta', 'api_keys': [{'id': '1', 'label': 'x' * 101}]}),
    (PaymentMethodCreate, {'issuer': 'Visa', 'alias': 'Principal', 'last_four': '12a4'}),
    (PaymentMethodUpdate, {'alias': ' '}),
    (PaymentMethodUpdate, {'expiry_month': '13'}),
    (PaymentMethodUpdate, {'expiry_year': '2a28'}),
    (ClientIncomeCreate, {'client_name': 'Cliente', 'concept': 'Servicio', 'amount': 100000001, 'received_date': '2026-01-01'}),
    (ClientIncomeCreate, {'client_name': 'Cliente', 'concept': 'Servicio', 'currency': 'EUR', 'received_date': '2026-01-01'}),
    (DomainRenewalCreate, {'client_name': 'Cliente', 'domain_or_service': 'example.com', 'renewal_date': '2026-01-01', 'currency': 'EUR'}),
    (DomainRenewalUpdate, {'provider': 'x' * 129}),
    (SecureResourceCreate, {'title': ' ', 'content': 'nota'}),
    (SecureResourceUpdate, {'content': 'x' * 1000001}),
    (SecureResourceCreate, {'title': 'Recurso', 'tags': [{'name': 'x' * 51}]}),
    (SettingsUpdate, {'budget_cap_amount': math.inf}),
    (SettingsUpdate, {'budget_cap_currency': 'EUR'}),
    (SettingsUpdate, {'vault_timeout_minutes': 0}),
    (SettingsUpdate, {'new_master_password': 'x' * 257}),
    (TotpSetupRequest, {'totp_secret': 'x' * 129}),
    (InternalProjectCreate, {'name': 'Proyecto', 'currency': 'EUR'}),
])
def test_new_and_updated_records_reject_invalid_input(model, payload):
    with pytest.raises(ValidationError):
        model.model_validate(payload)


def test_valid_boundaries_and_existing_records_remain_readable():
    assert ProspectCreate(company_name=' Empresa ', contact_name='x' * 128, estimated_value=100000000).company_name == 'Empresa'
    assert PaymentMethodCreate(issuer='Visa', alias='Principal', last_four='1234').last_four == '1234'
    assert PaymentMethodUpdate(expiry_month='12', expiry_year='2028').expiry_year == '2028'
    # Response base schemas must still accept previously stored longer text.
    assert len(ProspectBase(company_name='Empresa', contact_name='x' * 129).contact_name) == 129
    assert len(PlatformBase(name='x' * 129).name) == 129
    assert len(SecureResourceBase(title='Recurso', content='x' * 1000001).content) == 1000001
    assert ProspectCreate(company_name='Empresa', currency='USD').currency == 'USD'
    assert PlatformCreate(name='Cuenta', currency='USD').currency == 'USD'
