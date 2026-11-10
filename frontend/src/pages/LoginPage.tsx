import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Link as MuiLink,
  Stack,
  Typography,
} from "@mui/material";
import type React from "react";
import { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { login } from "../api/auth";
import AuthLayout, { type AuthRole } from "../components/auth/AuthLayout";
import LabeledField from "../components/auth/LabeledField";
import OAuthButtons from "../components/auth/OAuthButtons";
import PasswordField from "../components/auth/PasswordField";
import { useAuthStore } from "../stores/authStore";

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth); //state for authentication
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // ponytail: UI only — both roles send the same login request. Wire to the API when admin accounts exist.
  const [role, setRole] = useState<AuthRole>("user");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const { user, token } = await login(username, password, rememberMe);
      setAuth(user, token);
      navigate("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Login Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title={role === "user" ? "Welcome back" : "Log in to the admin console"}
      subtitle={
        role === "user"
          ? "Log in to manage your schemas and documents."
          : "Manage users, usage, billing and the job queue."
      }
      footer={
        role === "user" ? (
          <Typography color="text.secondary" sx={{ fontSize: 14 }}>
            Don't have an account?{" "}
            <MuiLink component={RouterLink} to="/register" sx={{ fontWeight: 600 }}>
              Sign up
            </MuiLink>
          </Typography>
        ) : (
          <Typography color="text.secondary" sx={{ fontSize: 13, lineHeight: 1.5 }}>
            Admin access is granted by an existing admin. Accounts without it
            are signed in to the user workspace.
          </Typography>
        )
      }
      role={role}
      setRole={setRole}
    >
      <Stack sx={{ gap: "22px" }}>
        <Box component="form" onSubmit={handleSubmit}>
          <Stack sx={{ gap: 2 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <LabeledField
              label="Username"
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              disabled={loading}
              required
            />

            <PasswordField
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              disabled={loading}
              labelAction={
                <MuiLink component={RouterLink} to="/forgot-password" sx={{ fontSize: 13, fontWeight: 600 }}>
                  Forgot password?
                </MuiLink>
              }
            />

            <FormControlLabel
              sx={{ ml: 0, gap: 1.25 }}
              control={
                <Checkbox
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={loading}
                  size="small"
                  sx={{ p: 0 }}
                />
              }
              label={
                <Typography color="text.secondary" sx={{ fontSize: 13 }}>
                  Keep me signed in for 90 days
                </Typography>
              }
            />

            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={loading}
              startIcon={loading && <CircularProgress size={14} color="inherit" />}
              sx={{ height: 44, fontSize: 14, fontWeight: 600 }}
            >
              {loading ? "Logging in…" : role === "admin" ? "Log in as admin" : "Log in"}
            </Button>
          </Stack>
        </Box>

        <OAuthButtons
          dividerText="or continue with"
          disabled={loading}
          onPick={(p) => setNotice(`${p} sign-in isn't available yet.`)}
        />
        {notice && <Alert severity="info">{notice}</Alert>}
      </Stack>
    </AuthLayout>
  );
}
