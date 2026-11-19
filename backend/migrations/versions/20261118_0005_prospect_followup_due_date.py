"""Add an optional due date for a prospect's next manual follow-up."""

import sqlalchemy as sa
from alembic import op


revision = "20261118_0005"
down_revision = "20261118_0004"
branch_labels = None
depends_on = None


_TABLE = "prospects"
_COLUMN = "followup_due_date"
_INDEX = "ix_prospects_followup_due_date"


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if _COLUMN not in {column["name"] for column in inspector.get_columns(_TABLE)}:
        op.add_column(_TABLE, sa.Column(_COLUMN, sa.Date(), nullable=True))
    if _INDEX not in {index["name"] for index in inspector.get_indexes(_TABLE)}:
        op.create_index(_INDEX, _TABLE, [_COLUMN])


def downgrade() -> None:
    raise RuntimeError("Revisión irreversible: conserva fechas de seguimiento. Restaura una copia previa verificada.")
