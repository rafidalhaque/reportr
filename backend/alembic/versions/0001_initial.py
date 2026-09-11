"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-09-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "orgs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("slug", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_table(
        "staff_users",
        sa.Column("org_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("global_role", sa.String(length=32), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("hashed_password", sa.String(length=1024), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_superuser", sa.Boolean(), nullable=False),
        sa.Column("is_verified", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_staff_users_email"), "staff_users", ["email"], unique=True)
    op.create_table(
        "researchers",
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("portfolio_url", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("leaderboard_opt_in", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("hashed_password", sa.String(length=1024), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_superuser", sa.Boolean(), nullable=False),
        sa.Column("is_verified", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_researchers_email"), "researchers", ["email"], unique=True)
    op.create_table(
        "programs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("org_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("slug", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("scope_markdown", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("visibility", sa.String(length=32), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ),
        sa.ForeignKeyConstraint(["created_by_id"], ["staff_users.id"], ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_table(
        "applications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("org_id", sa.Uuid(), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("program_id", sa.Uuid(), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("portfolio_url", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("decided_by_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ),
        sa.ForeignKeyConstraint(["program_id"], ["programs.id"], ),
        sa.ForeignKeyConstraint(["decided_by_id"], ["staff_users.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_applications_email"), "applications", ["email"], unique=False)
    op.create_table(
        "invites",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("org_id", sa.Uuid(), nullable=True),
        sa.Column("program_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked", sa.Boolean(), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ),
        sa.ForeignKeyConstraint(["program_id"], ["programs.id"], ),
        sa.ForeignKeyConstraint(["created_by_id"], ["staff_users.id"], ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index(op.f("ix_invites_email"), "invites", ["email"], unique=False)
    op.create_table(
        "program_memberships",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("researcher_id", sa.Uuid(), nullable=False),
        sa.Column("program_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["researcher_id"], ["researchers.id"], ),
        sa.ForeignKeyConstraint(["program_id"], ["programs.id"], ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("researcher_id", "program_id", name="uq_membership"),
    )
    op.create_table(
        "program_roles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("staff_id", sa.Uuid(), nullable=False),
        sa.Column("program_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["staff_id"], ["staff_users.id"], ),
        sa.ForeignKeyConstraint(["program_id"], ["programs.id"], ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("staff_id", "program_id", name="uq_program_role"),
    )
    op.create_table(
        "reports",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("org_id", sa.Uuid(), nullable=True),
        sa.Column("program_id", sa.Uuid(), nullable=False),
        sa.Column("researcher_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("cvss", sa.String(length=64), nullable=True),
        sa.Column("repro_steps", sa.Text(), nullable=False),
        sa.Column("affected_asset", sa.String(length=200), nullable=True),
        sa.Column("attachments", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("assigned_staff_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ),
        sa.ForeignKeyConstraint(["program_id"], ["programs.id"], ),
        sa.ForeignKeyConstraint(["researcher_id"], ["researchers.id"], ),
        sa.ForeignKeyConstraint(["assigned_staff_id"], ["staff_users.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_reports_program_id"), "reports", ["program_id"], unique=False)
    op.create_index(op.f("ix_reports_status"), "reports", ["status"], unique=False)
    op.create_table(
        "report_comments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("report_id", sa.Uuid(), nullable=False),
        sa.Column("author_staff_id", sa.Uuid(), nullable=True),
        sa.Column("author_researcher_id", sa.Uuid(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("internal_only", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["report_id"], ["reports.id"], ),
        sa.ForeignKeyConstraint(["author_staff_id"], ["staff_users.id"], ),
        sa.ForeignKeyConstraint(["author_researcher_id"], ["researchers.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_report_comments_report_id"), "report_comments", ["report_id"], unique=False)
    op.create_table(
        "payouts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("report_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("method", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["report_id"], ["reports.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("payouts")
    op.drop_index(op.f("ix_report_comments_report_id"), table_name="report_comments")
    op.drop_table("report_comments")
    op.drop_index(op.f("ix_reports_status"), table_name="reports")
    op.drop_index(op.f("ix_reports_program_id"), table_name="reports")
    op.drop_table("reports")
    op.drop_table("program_roles")
    op.drop_table("program_memberships")
    op.drop_index(op.f("ix_invites_email"), table_name="invites")
    op.drop_table("invites")
    op.drop_index(op.f("ix_applications_email"), table_name="applications")
    op.drop_table("applications")
    op.drop_table("programs")
    op.drop_index(op.f("ix_researchers_email"), table_name="researchers")
    op.drop_table("researchers")
    op.drop_index(op.f("ix_staff_users_email"), table_name="staff_users")
    op.drop_table("staff_users")
    op.drop_table("orgs")
