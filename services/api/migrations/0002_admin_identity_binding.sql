ALTER TABLE admin_users
ADD COLUMN identity_status TEXT NOT NULL DEFAULT 'bound'
  CHECK (identity_status IN ('pending', 'bound'));

CREATE INDEX idx_admin_users_identity_status
  ON admin_users(identity_status, email);
