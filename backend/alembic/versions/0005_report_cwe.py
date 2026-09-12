"""report cwe bug type

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("reports", sa.Column("cwe_id", sa.String(length=16), nullable=True))
    op.add_column("reports", sa.Column("cwe_name", sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column("reports", "cwe_name")
    op.drop_column("reports", "cwe_id")
