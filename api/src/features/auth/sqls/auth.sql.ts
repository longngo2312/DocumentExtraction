export const AUTH_SQL = {
  findUserIdByEmail: `SELECT id FROM users WHERE email = ?;`,

  findUserForLogin: `
    SELECT
      id,
      username,
      email,
      password_hash
    FROM users
    WHERE email = ?;
  `,

  // Refresh only stores user_id, so the new access token needs the email back.
  findUserById: `SELECT id, username, email FROM users WHERE id = ?;`,

  insertUser: `
    INSERT INTO users
      (username, password_hash, email, tenant_db_path)
      VALUES (?, ?, ?, ?);
  `,

  updateTenantDbPath: `
    UPDATE users
      SET tenant_db_path = ?
      WHERE id = ?;
  `,

  updateLastLogin: `
    UPDATE users
    SET last_login_at = datetime('now')
    WHERE id = ?;
  `,
};

export const REFRESH_SQL = {
  insert: `
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES (?, ?, ?);
  `,

  // Deliberately does NOT filter on revoked_at/expires_at — the caller has to
  // see a revoked row to tell "already used" apart from "never existed".
  findByHash: `
    SELECT id, user_id, expires_at, revoked_at
    FROM refresh_tokens
    WHERE token_hash = ?;
  `,

  revokeById: `
    UPDATE refresh_tokens
    SET revoked_at = datetime('now')
    WHERE id = ? AND revoked_at IS NULL;
  `,

  // Breach response: a rotated token being replayed means the cookie leaked,
  // so every live session for that user goes.
  revokeAllForUser: `
    UPDATE refresh_tokens
    SET revoked_at = datetime('now')
    WHERE user_id = ? AND revoked_at IS NULL;
  `,

  deleteExpired: `
    DELETE FROM refresh_tokens
    WHERE expires_at < datetime('now');
  `,
};
