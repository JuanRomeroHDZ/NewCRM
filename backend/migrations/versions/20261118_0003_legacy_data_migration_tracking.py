"""Record one-time application data migrations."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20261118_0003"
down_revision: Union[str, Sequence[str], None] = "20261118_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table("core_data_migrations"):
        op.create_table(
            "core_data_migrations",
            sa.Column("id", sa.String(length=96), nullable=False),
            sa.Column("applied_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    # Keeping the marker prevents a future deployment from repeating a costly migration.
    pass
