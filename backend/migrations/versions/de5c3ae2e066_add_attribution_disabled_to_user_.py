"""add attribution_disabled to user_settings

Revision ID: de5c3ae2e066
Revises: i9j0k1l2m3n4
Create Date: 2026-01-20 11:37:50.089741

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'de5c3ae2e066'
down_revision: Union[str, None] = 'i9j0k1l2m3n4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('user_settings', sa.Column('attribution_disabled', sa.Boolean(), server_default='false', nullable=False))
    op.alter_column('user_settings', 'e2b_api_key',
               existing_type=sa.TEXT(),
               type_=sa.String(),
               existing_nullable=True)
    op.execute("UPDATE user_settings SET sandbox_provider = 'docker' WHERE sandbox_provider IS NULL")
    op.alter_column('user_settings', 'sandbox_provider',
               existing_type=sa.VARCHAR(),
               nullable=False)


def downgrade() -> None:
    op.alter_column('user_settings', 'sandbox_provider',
               existing_type=sa.VARCHAR(),
               nullable=True)
    op.alter_column('user_settings', 'e2b_api_key',
               existing_type=sa.String(),
               type_=sa.TEXT(),
               existing_nullable=True)
    op.drop_column('user_settings', 'attribution_disabled')
