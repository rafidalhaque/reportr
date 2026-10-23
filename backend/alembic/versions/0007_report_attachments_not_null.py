"""reports.attachments NOT NULL (align with the model)

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("UPDATE reports SET attachments = '[]' WHERE attachments IS NULL"))
    with op.batch_alter_table("reports") as batch:
        batch.alter_column("attachments", existing_type=sa.JSON(), nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("reports") as batch:
        batch.alter_column("attachments", existing_type=sa.JSON(), nullable=True)
