export interface RegisterBody {
  username: string;
  email: string;
  password: string;
}

export interface LoginBody {
  email: string;
  password: string;
  /** Stretches the refresh token from 30 to 90 days. */
  rememberMe?: boolean;
}

export interface JWTPayload {
  userId: number;
  email: string;
}

export interface AuthUser {
  id: number;
  username: string;
  email: string;
}

/** `token` is the short-lived access JWT; the refresh token rides in a cookie. */
export interface AuthResponse {
  success: true;
  message: string;
  token: string;
  user: AuthUser;
}

/** What the service hands back so the controller can set the cookie. */
export interface SessionResult {
  response: AuthResponse;
  refreshToken: string;
  refreshMaxAgeMs: number;
}

export interface RefreshResult {
  token: string;
  refreshToken: string;
  refreshMaxAgeMs: number;
}

export interface RefreshRow {
  id: number;
  user_id: number;
  expires_at: string;
  revoked_at: string | null;
}
