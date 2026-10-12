import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Link as MuiLink,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type React from "react";
import { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { login } from "../api/auth";
import AuthLayout from "../components/auth/AuthLayout";
import PasswordField from "../components/auth/PasswordField";
import { useAuthStore } from "../stores/authStore";

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { user, token } = await login(email, password, rememberMe);
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
      title="Welcome back"
      subtitle="Log in to manage your schemas and documents."
      footer={
        <Typography variant="body2" color="text.secondary">
          Don't have an account?{" "}
          <MuiLink component={RouterLink} to="/register" sx={{ fontWeight: 600 }}>
            Sign up
          </MuiLink>
        </Typography>
      }
    >
      <Box component="form" onSubmit={handleSubmit}>
        <Stack spacing={2.5}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            disabled={loading}
            fullWidth
            required
          />

          <PasswordField
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            disabled={loading}
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loading}
                size="small"
              />
            }
            label={
              <Typography variant="body2" color="text.secondary">
                Keep me signed in for 90 days
              </Typography>
            }
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={loading}
            sx={{ py: 1.25, fontWeight: 600 }}
          >
            {loading ? "Logging in…" : "Log in"}
          </Button>
        </Stack>
      </Box>
    </AuthLayout>
  );
}
