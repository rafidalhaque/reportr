"""public report forms + platform settings

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "programs",
        sa.Column("public_reporting", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("reports", sa.Column("submitter_email", sa.String(length=320), nullable=True))
    # Public-form reports have no researcher account behind them
    with op.batch_alter_table("reports") as batch:
        batch.alter_column("researcher_id", existing_type=sa.Uuid(), nullable=True)
    op.create_table(
        "platform_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("researcher_applications_enabled", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("platform_settings")
    with op.batch_alter_table("reports") as batch:
        batch.alter_column("researcher_id", existing_type=sa.Uuid(), nullable=False)
    op.drop_column("reports", "submitter_email")
    op.drop_column("programs", "public_reporting")
