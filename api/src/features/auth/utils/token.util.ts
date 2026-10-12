/// <reference types="node" />
import crypto from "crypto";
import type { CookieOptions, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../../middleware/auth.js";
import type { JWTPayload } from "../dtos/auth.dto.js";

/** Short enough that a stolen access token is close to worthless. */
export const ACCESS_TOKEN_TTL = "15m";

const DAY_MS = 24 * 60 * 60 * 1000;
export const REFRESH_TTL_MS = 30 * DAY_MS;
export const REFRESH_TTL_REMEMBER_MS = 90 * DAY_MS;

export const REFRESH_COOKIE = "refresh_token";

const isProd = process.env.NODE_ENV === "production";

/**
 * Scoped to /api/auth so the cookie rides along with refresh and logout but is
 * never sent to the document or schema routes — those use the Bearer header.
 */
export function refreshCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    // "lax" is enough in dev: :5173 and :3000 are same-site (ports are ignored
    // for site comparison). A real cross-domain deploy needs "none" + secure.
    sameSite: isProd ? "strict" : "lax",
    secure: isProd,
    path: "/api/auth",
    maxAge: maxAgeMs,
  };
}

export function signAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

/** The raw value goes to the client; only its hash is ever persisted. */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** SQLite compares datetimes as text, so expiry has to match its format. */
export function toSqliteDate(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

export function setRefreshCookie(
  res: Response,
  token: string,
  maxAgeMs: number,
) {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions(maxAgeMs));
}

export function clearRefreshCookie(res: Response) {
  // maxAge is irrelevant here but the rest of the attributes must match the
  // ones used to set it, or the browser keeps the original cookie.
  const { maxAge: _ignored, ...options } = refreshCookieOptions(0);
  res.clearCookie(REFRESH_COOKIE, options);
}
