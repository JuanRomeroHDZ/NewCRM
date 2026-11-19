"""Encrypt account TOTP seeds with the server key."""

import sqlalchemy as sa
from alembic import op

revision = "20261119_0007"
down_revision = "20261119_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from app.security.crypto import encrypt_note, get_server_seed_key

    op.alter_column("core_users", "totp_secret", existing_type=sa.String(64), type_=sa.Text())
    accounts = sa.table("core_users", sa.column("id", sa.String), sa.column("totp_secret", sa.Text))
    connection = op.get_bind()
    key = get_server_seed_key()
    for user_id, seed in connection.execute(
        sa.select(accounts.c.id, accounts.c.totp_secret).where(accounts.c.totp_secret.is_not(None))
    ):
        connection.execute(
            accounts.update().where(accounts.c.id == user_id).values(totp_secret=encrypt_note(seed, key=key))
        )


def downgrade() -> None:
    raise RuntimeError("Restaura un respaldo compatible para volver a la versión anterior.")
