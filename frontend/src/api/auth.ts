import type { User } from "../types/index";
import { apiFetch } from "./client";
interface AuthResponse {
  token: string;
  user: User;
}

export function register(username: string, email: string, password: string) {
  return apiFetch<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, email, password }),
  });
}

export function login(email: string, password: string, rememberMe = false) {
  return apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, rememberMe }),
  });
}

/** Revokes the refresh token server-side and clears its cookie. */
export function logout() {
  return apiFetch<void>("/auth/logout", { method: "POST" });
}
