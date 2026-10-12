import adminDb from "../../../db/adminDB.js";
import { provisionTenantDB } from "../../../db/tenantDb.js";
import type {
  AuthUser,
  LoginBody,
  RefreshResult,
  RefreshRow,
  RegisterBody,
  SessionResult,
} from "../dtos/auth.dto.js";
import type { User } from "../models/auth.model.js";
import { AUTH_SQL, REFRESH_SQL } from "../sqls/auth.sql.js";
import { comparePassword, hashPassword } from "../utils/password.util.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TTL_MS,
  REFRESH_TTL_REMEMBER_MS,
  signAccessToken,
  toSqliteDate,
} from "../utils/token.util.js";

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Issues an access token plus a fresh refresh token row. */
function startSession(
  user: AuthUser,
  rememberMe: boolean,
  message: string,
): SessionResult {
  const refreshMaxAgeMs = rememberMe ? REFRESH_TTL_REMEMBER_MS : REFRESH_TTL_MS;
  const refreshToken = generateRefreshToken();

  adminDb
    .prepare(REFRESH_SQL.insert)
    .run(
      user.id,
      hashRefreshToken(refreshToken),
      toSqliteDate(new Date(Date.now() + refreshMaxAgeMs)),
    );

  return {
    response: {
      success: true,
      message,
      token: signAccessToken({ userId: user.id, email: user.email }),
      user,
    },
    refreshToken,
    refreshMaxAgeMs,
  };
}

export async function registerUser(body: RegisterBody): Promise<SessionResult> {
  let { username, email, password } = body;
  username = username?.trim();
  email = email.trim().toLowerCase();

  const existing = adminDb.prepare(AUTH_SQL.findUserIdByEmail).get(email);
  if (existing) {
    throw new AuthError(409, "Email already registered.");
  }

  const passwordHash = await hashPassword(password);

  const result = adminDb
    .prepare(AUTH_SQL.insertUser)
    .run(username, passwordHash, email, "");
  const userId = Number(result.lastInsertRowid);

  const tenantDBPath = provisionTenantDB(userId);
  adminDb.prepare(AUTH_SQL.updateTenantDbPath).run(tenantDBPath, userId);

  // A brand-new account gets the standard 30 days; remember-me is a login choice.
  return startSession(
    { id: userId, username, email },
    false,
    "User registered successfully.",
  );
}

export async function loginUser(body: LoginBody): Promise<SessionResult> {
  const email = body.email?.trim().toLowerCase();
  const { password, rememberMe } = body;

  const user = adminDb.prepare(AUTH_SQL.findUserForLogin).get(email) as
    | User
    | undefined;

  if (!user) {
    throw new AuthError(401, "User not found");
  }

  const validPassword = await comparePassword(password, user.password_hash);
  if (!validPassword) {
    throw new AuthError(401, "Invalid password.");
  }

  adminDb.prepare(AUTH_SQL.updateLastLogin).run(user.id);

  return startSession(
    { id: user.id, username: user.username, email: user.email },
    Boolean(rememberMe),
    "Login successful.",
  );
}

/**
 * Validates a refresh token and rotates it: the presented token is revoked and
 * a new one issued. Replaying an already-revoked token is treated as theft and
 * kills every session for that user.
 */
export function refreshSession(presentedToken: string): RefreshResult {
  const row = adminDb
    .prepare(REFRESH_SQL.findByHash)
    .get(hashRefreshToken(presentedToken)) as RefreshRow | undefined;

  if (!row) {
    throw new AuthError(401, "Invalid session.");
  }

  if (row.revoked_at) {
    adminDb.prepare(REFRESH_SQL.revokeAllForUser).run(row.user_id);
    throw new AuthError(401, "Session reuse detected. Please log in again.");
  }

  if (new Date(row.expires_at.replace(" ", "T") + "Z") <= new Date()) {
    throw new AuthError(401, "Session expired.");
  }

  const user = adminDb.prepare(AUTH_SQL.findUserById).get(row.user_id) as
    | AuthUser
    | undefined;
  if (!user) {
    throw new AuthError(401, "Invalid session.");
  }

  // Preserve the original window rather than resetting it, so rotation can't
  // extend a 30-day session indefinitely past what the user agreed to.
  const remainingMs =
    new Date(row.expires_at.replace(" ", "T") + "Z").getTime() - Date.now();
  const nextToken = generateRefreshToken();

  const rotate = adminDb.transaction(() => {
    adminDb.prepare(REFRESH_SQL.revokeById).run(row.id);
    adminDb
      .prepare(REFRESH_SQL.insert)
      .run(
        row.user_id,
        hashRefreshToken(nextToken),
        toSqliteDate(new Date(Date.now() + remainingMs)),
      );
  });
  rotate();

  return {
    token: signAccessToken({ userId: user.id, email: user.email }),
    refreshToken: nextToken,
    refreshMaxAgeMs: remainingMs,
  };
}

/** Idempotent — logging out with a stale or missing cookie is not an error. */
export function revokeSession(presentedToken: string | undefined) {
  if (!presentedToken) return;

  const row = adminDb
    .prepare(REFRESH_SQL.findByHash)
    .get(hashRefreshToken(presentedToken)) as RefreshRow | undefined;

  if (row) adminDb.prepare(REFRESH_SQL.revokeById).run(row.id);
}
