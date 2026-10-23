from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a7b92c"
down_revision = "1ff6608af87a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("reset_otp_hash", sa.String(), nullable=True)
    )

    op.add_column(
        "users",
        sa.Column(
            "reset_otp_expires",
            sa.DateTime(timezone=True),
            nullable=True
        )
    )


def downgrade() -> None:
    op.drop_column("users", "reset_otp_expires")
    op.drop_column("users", "reset_otp_hash")
