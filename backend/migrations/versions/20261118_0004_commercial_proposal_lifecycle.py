"""Track proposal dispatch, exact issued PDF and customer response."""

import sqlalchemy as sa
from alembic import op


revision = "20261118_0004"
down_revision = "20261118_0003"
branch_labels = None
depends_on = None


_TABLE = "crm_proposals"


def upgrade() -> None:
    # Legacy adoption can create missing application tables from current metadata.
    # Keep the revision safe when such a table already contains these columns.
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns(_TABLE)}
    columns = (
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("sent_by", sa.String(128), nullable=True),
        sa.Column("send_channel", sa.String(32), nullable=True),
        sa.Column("sent_to", sa.String(255), nullable=True),
        sa.Column("issued_at", sa.DateTime(), nullable=True),
        sa.Column("issued_pdf", sa.LargeBinary(), nullable=True),
        sa.Column("responded_at", sa.DateTime(), nullable=True),
        sa.Column("responded_by", sa.String(128), nullable=True),
        sa.Column("respondent", sa.String(255), nullable=True),
        sa.Column("response_channel", sa.String(32), nullable=True),
        sa.Column("response_evidence", sa.Text(), nullable=True),
    )
    for column in columns:
        if column.name not in existing:
            op.add_column(_TABLE, column)


def downgrade() -> None:
    raise RuntimeError("Revisión irreversible: conserva evidencia comercial. Restaura una copia previa verificada.")
