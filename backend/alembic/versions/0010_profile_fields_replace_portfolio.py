"""researcher profile answers replace portfolio_url / application message

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_TEMPLATE_BODY = (
    "A new researcher application arrived from {{email}}{{for_program}}.\n\n"
    "Message: {{message}}\n"
    "Portfolio: {{portfolio}}"
)
NEW_TEMPLATE_BODY = "A new researcher application arrived from {{email}}{{for_program}}."


def upgrade() -> None:
    op.add_column("researchers", sa.Column("answers", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
    with op.batch_alter_table("researchers") as batch:
        batch.drop_column("portfolio_url")
    with op.batch_alter_table("applications") as batch:
        batch.drop_column("message")
        batch.drop_column("portfolio_url")
    # refresh the seeded default text only if it was never customised
    op.get_bind().execute(
        sa.text("UPDATE email_templates SET body = :new WHERE name = 'new_application' AND body = :old"),
        {"new": NEW_TEMPLATE_BODY, "old": OLD_TEMPLATE_BODY},
    )


def downgrade() -> None:
    with op.batch_alter_table("applications") as batch:
        batch.add_column(sa.Column("portfolio_url", sa.String(length=500), nullable=True))
        batch.add_column(sa.Column("message", sa.Text(), nullable=False, server_default=""))
    with op.batch_alter_table("researchers") as batch:
        batch.add_column(sa.Column("portfolio_url", sa.String(length=500), nullable=True))
        batch.drop_column("answers")
