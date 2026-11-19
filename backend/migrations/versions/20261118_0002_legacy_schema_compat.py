"""Complete older unversioned schemas using additive, data-preserving changes.

The one-time bootstrap stamps the baseline only after reconciling an existing
installation. This revision remains idempotent for fresh installs and records
the historical compatibility steps in Alembic's version history.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20261118_0002"
down_revision: Union[str, Sequence[str], None] = "d5c73d1657ce"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_POSTGRES_COMPATIBILITY_DDL = (
    "ALTER TABLE platform_accounts ALTER COLUMN icon_url TYPE TEXT",
    "ALTER TABLE email_accounts ALTER COLUMN icon TYPE TEXT",
    "ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITHOUT TIME ZONE",
    "ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMP WITHOUT TIME ZONE",
    "ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS scope VARCHAR(32) DEFAULT 'business'",
    "ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITHOUT TIME ZONE",
    "ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMP WITHOUT TIME ZONE",
    "ALTER TABLE platform_accounts ALTER COLUMN email_id DROP NOT NULL",
    "ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS prospect_id VARCHAR(36)",
    "ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS project_id VARCHAR(36)",
    "ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS ownership_type VARCHAR(32) DEFAULT 'own'",
    "ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS scope VARCHAR(32) DEFAULT 'business'",
    "ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS business_share_percent FLOAT DEFAULT 100.0",
    "ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS start_date VARCHAR(32)",
    "ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITHOUT TIME ZONE",
    "ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS scope VARCHAR(32) DEFAULT 'business'",
    "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMP WITHOUT TIME ZONE",
    "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS followup_count INTEGER DEFAULT 0",
    "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_contact_channel VARCHAR(32)",
    "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS followup_sla_hours FLOAT DEFAULT 48.0",
    "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS max_followup_attempts INTEGER DEFAULT 3",
    "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS estimated_value FLOAT DEFAULT 0.0",
    "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS currency VARCHAR(8) DEFAULT 'MXN'",
    "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS billing_type VARCHAR(32) DEFAULT 'one_time'",
    "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITHOUT TIME ZONE",
    "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS scope VARCHAR(32) DEFAULT 'business'",
    "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS budget_cap_amount FLOAT DEFAULT 0.0",
    "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS budget_cap_currency VARCHAR(8) DEFAULT 'MXN'",
    "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS password_rotation_days_root INTEGER DEFAULT 90",
    "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS password_rotation_days_secondary INTEGER DEFAULT 180",
    "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS trash_retention_days INTEGER DEFAULT 0",
    "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS max_followup_attempts INTEGER DEFAULT 3",
    "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS vault_salt VARCHAR(64)",
    "ALTER TABLE client_incomes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITHOUT TIME ZONE",
    "ALTER TABLE client_incomes ADD COLUMN IF NOT EXISTS project_id VARCHAR(36)",
    "ALTER TABLE client_incomes ADD COLUMN IF NOT EXISTS ownership_type VARCHAR(32) DEFAULT 'client'",
    "ALTER TABLE client_incomes ADD COLUMN IF NOT EXISTS scope VARCHAR(32) DEFAULT 'business'",
    "ALTER TABLE client_incomes ADD COLUMN IF NOT EXISTS business_share_percent FLOAT DEFAULT 100.0",
    "ALTER TABLE client_incomes ALTER COLUMN category TYPE VARCHAR(64)",
    "ALTER TABLE domain_renewals ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITHOUT TIME ZONE",
    "ALTER TABLE domain_renewals ADD COLUMN IF NOT EXISTS project_id VARCHAR(36)",
    "ALTER TABLE domain_renewals ADD COLUMN IF NOT EXISTS ownership_type VARCHAR(32) DEFAULT 'client'",
    "ALTER TABLE domain_renewals ADD COLUMN IF NOT EXISTS scope VARCHAR(32) DEFAULT 'business'",
    "ALTER TABLE domain_renewals ADD COLUMN IF NOT EXISTS business_share_percent FLOAT DEFAULT 100.0",
    "ALTER TABLE domain_renewals ADD COLUMN IF NOT EXISTS client_charge_amount FLOAT DEFAULT 0.0",
    "ALTER TABLE domain_renewals ALTER COLUMN service_type TYPE VARCHAR(64)",
    "ALTER TABLE one_time_expenses ADD COLUMN IF NOT EXISTS platform_id VARCHAR(36) REFERENCES platform_accounts(id)",
    "ALTER TABLE one_time_expenses ADD COLUMN IF NOT EXISTS payment_method_id VARCHAR(36) REFERENCES payment_methods(id)",
    "ALTER TABLE one_time_expenses ADD COLUMN IF NOT EXISTS recurrence_cycle VARCHAR(32)",
    "CREATE INDEX IF NOT EXISTS ix_one_time_expenses_platform_id ON one_time_expenses (platform_id)",
    "CREATE INDEX IF NOT EXISTS ix_one_time_expenses_payment_method_id ON one_time_expenses (payment_method_id)",
    "ALTER TABLE writeup_revisions ADD COLUMN IF NOT EXISTS encrypted_snapshot TEXT",
    "ALTER TABLE writeup_revisions ADD COLUMN IF NOT EXISTS change_type VARCHAR(32)",
    "ALTER TABLE writeups ADD COLUMN IF NOT EXISTS encrypted_workbench_json TEXT",
    "ALTER TABLE pentest_engagements ADD COLUMN IF NOT EXISTS authorized_ipv6_targets TEXT NOT NULL DEFAULT ''",
    "CREATE INDEX IF NOT EXISTS ix_writeup_revisions_writeup_revision ON writeup_revisions (writeup_id, revision_number)",
    "CREATE INDEX IF NOT EXISTS ix_writeup_revisions_writeup_created ON writeup_revisions (writeup_id, created_at)",
    "ALTER TABLE writeup_assets ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE NOT NULL",
    "ALTER TABLE report_canvases ADD COLUMN IF NOT EXISTS encrypted_svg_snapshot TEXT",
)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        # SQLite is used by unit tests; its dynamic typing and fresh baseline do
        # not need these PostgreSQL-specific compatibility alterations.
        return
    for statement in _POSTGRES_COMPATIBILITY_DDL:
        op.execute(statement)


def downgrade() -> None:
    # The additions are intentionally retained to avoid dropping user data.
    pass
