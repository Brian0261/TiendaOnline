-- Hardening de tokens de seguridad para auth (local/staging)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_email_verification_token_expiry'
  ) THEN
    ALTER TABLE email_verification_token
      ADD CONSTRAINT ck_email_verification_token_expiry
      CHECK (expires_at > created_at);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_password_reset_token_expiry'
  ) THEN
    ALTER TABLE password_reset_token
      ADD CONSTRAINT ck_password_reset_token_expiry
      CHECK (expires_at > created_at);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_email_verification_token_user_active
  ON email_verification_token (id_usuario, expires_at)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_password_reset_token_user_active
  ON password_reset_token (id_usuario, expires_at)
  WHERE used_at IS NULL;
