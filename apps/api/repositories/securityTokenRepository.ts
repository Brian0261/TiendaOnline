const { poolPromise } = require("../config/db.config");

async function createEmailVerificationToken({ id_usuario, token_hash, expires_at }) {
  const pool = await poolPromise;
  await pool.query(
    `
      INSERT INTO email_verification_token (id_usuario, token_hash, expires_at)
      VALUES ($1, $2, $3);
    `,
    [id_usuario, token_hash, expires_at],
  );
}

async function createPasswordResetToken({ id_usuario, token_hash, expires_at }) {
  const pool = await poolPromise;
  await pool.query(
    `
      INSERT INTO password_reset_token (id_usuario, token_hash, expires_at)
      VALUES ($1, $2, $3);
    `,
    [id_usuario, token_hash, expires_at],
  );
}

async function invalidateActivePasswordResetTokensByUserId({ id_usuario }) {
  const pool = await poolPromise;
  await pool.query(
    `
      UPDATE password_reset_token
      SET used_at = NOW()
      WHERE id_usuario = $1
        AND used_at IS NULL
        AND expires_at > NOW();
    `,
    [id_usuario],
  );
}

async function consumeEmailVerificationTokenAndVerifyUser({ token_hash }) {
  const pool = await poolPromise;
  const tx = await pool.connect();

  try {
    await tx.query("BEGIN");

    const consume = await tx.query(
      `
        UPDATE email_verification_token
        SET used_at = NOW()
        WHERE token_hash = $1
          AND used_at IS NULL
          AND expires_at > NOW()
        RETURNING id_usuario;
      `,
      [token_hash],
    );

    const id_usuario = consume.rows?.[0]?.id_usuario;
    if (!id_usuario) {
      await tx.query("ROLLBACK");
      return null;
    }

    await tx.query(
      `
        UPDATE usuario
        SET email_verificado = true,
            email_verificado_en = COALESCE(email_verificado_en, NOW())
        WHERE id_usuario = $1;
      `,
      [id_usuario],
    );

    await tx.query("COMMIT");
    return { id_usuario };
  } catch (err) {
    try {
      await tx.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    tx.release();
  }
}

async function consumePasswordResetTokenAndUpdatePassword({ token_hash, password_hash }) {
  const pool = await poolPromise;
  const tx = await pool.connect();

  try {
    await tx.query("BEGIN");

    const consume = await tx.query(
      `
        UPDATE password_reset_token
        SET used_at = NOW()
        WHERE token_hash = $1
          AND used_at IS NULL
          AND expires_at > NOW()
        RETURNING id_usuario;
      `,
      [token_hash],
    );

    const id_usuario = consume.rows?.[0]?.id_usuario;
    if (!id_usuario) {
      await tx.query("ROLLBACK");
      return null;
    }

    await tx.query(
      `
        UPDATE usuario
        SET contrasena = $2
        WHERE id_usuario = $1;
      `,
      [id_usuario, password_hash],
    );

    await tx.query("COMMIT");
    return { id_usuario };
  } catch (err) {
    try {
      await tx.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    tx.release();
  }
}

module.exports = {
  createEmailVerificationToken,
  createPasswordResetToken,
  invalidateActivePasswordResetTokensByUserId,
  consumeEmailVerificationTokenAndVerifyUser,
  consumePasswordResetTokenAndUpdatePassword,
};

export {};
