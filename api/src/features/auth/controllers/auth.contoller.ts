import { Request, Response } from "express";
import type { LoginBody, RegisterBody } from "../dtos/auth.dto.js";
import {
  AuthError,
  loginUser,
  refreshSession,
  registerUser,
  revokeSession,
} from "../services/auth.service..js";
import {
  clearRefreshCookie,
  REFRESH_COOKIE,
  setRefreshCookie,
} from "../utils/token.util.js";
import { isValidEmail, isValidPassword } from "../utils/validation.util.js";

function handleAuthError(error: unknown, res: Response) {
  if (error instanceof AuthError) {
    return res
      .status(error.status)
      .json({ success: false, message: error.message });
  }
  console.error(error);
  return res
    .status(500)
    .json({ success: false, message: "Internal server error." });
}

export async function register(
  req: Request<{}, {}, RegisterBody>,
  res: Response,
) {
  try {
    const { username, email, password } = req.body;
    const trimmedUsername = username?.trim();
    const trimmedEmail = email?.trim().toLowerCase();

    if (!trimmedUsername || !trimmedEmail || !password) {
      return res.status(400).json({
        success: false,
        message: "Username, email and password are required.",
      });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters.",
      });
    }

    if (!isValidEmail(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address.",
      });
    }

    const session = await registerUser(req.body);
    setRefreshCookie(res, session.refreshToken, session.refreshMaxAgeMs);
    return res.status(201).json(session.response);
  } catch (error) {
    return handleAuthError(error, res);
  }
}

export async function login(req: Request<{}, {}, LoginBody>, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const session = await loginUser(req.body);
    setRefreshCookie(res, session.refreshToken, session.refreshMaxAgeMs);
    return res.json(session.response);
  } catch (error) {
    return handleAuthError(error, res);
  }
}

/** Swaps the refresh cookie for a new access token, rotating the cookie. */
export function refresh(req: Request, res: Response) {
  const presented = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!presented) {
    return res
      .status(401)
      .json({ success: false, message: "No session cookie." });
  }

  try {
    const result = refreshSession(presented);
    setRefreshCookie(res, result.refreshToken, result.refreshMaxAgeMs);
    return res.json({ success: true, token: result.token });
  } catch (error) {
    // Any failure here means the session is unusable — drop the cookie so the
    // browser stops replaying a token that will never work again.
    clearRefreshCookie(res);
    return handleAuthError(error, res);
  }
}

export function logout(req: Request, res: Response) {
  try {
    revokeSession(req.cookies?.[REFRESH_COOKIE] as string | undefined);
    clearRefreshCookie(res);
    return res.status(204).send();
  } catch (error) {
    return handleAuthError(error, res);
  }
}
