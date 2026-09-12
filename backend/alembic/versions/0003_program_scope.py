"""structured program scope

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "program_scope",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("org_id", sa.Uuid(), nullable=True),
        sa.Column("program_id", sa.Uuid(), nullable=False),
        sa.Column("target", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("in_scope", sa.Boolean(), nullable=False),
        sa.Column("severity_guide", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ),
        sa.ForeignKeyConstraint(["program_id"], ["programs.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_program_scope_program_id"), "program_scope", ["program_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_program_scope_program_id"), table_name="program_scope")
    op.drop_table("program_scope")
