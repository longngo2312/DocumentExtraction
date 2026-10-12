import {
  Alert,
  Box,
  Button,
  Link as MuiLink,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type React from "react";
import { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { register } from "../api/auth";
import AuthLayout from "../components/auth/AuthLayout";
import PasswordField from "../components/auth/PasswordField";
import { useAuthStore } from "../stores/authStore";

const MIN_PASSWORD_LENGTH = 8;

export default function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Mirrors isValidPassword on the API so the user isn't told after a round trip.
  const passwordTooShort =
    password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await register(username, email, password);
      setAuth(user, token);
      navigate("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Registration Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Define schemas once, then extract structured data from every upload."
      footer={
        <Typography variant="body2" color="text.secondary">
          Already have an account?{" "}
          <MuiLink component={RouterLink} to="/login" sx={{ fontWeight: 600 }}>
            Log in
          </MuiLink>
        </Typography>
      }
    >
      <Box component="form" onSubmit={handleSubmit}>
        <Stack spacing={2.5}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            disabled={loading}
            fullWidth
            required
          />

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
            autoComplete="new-password"
            disabled={loading}
            helperText={
              passwordTooShort
                ? `At least ${MIN_PASSWORD_LENGTH} characters`
                : " "
            }
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={loading || passwordTooShort}
            sx={{ py: 1.25, fontWeight: 600 }}
          >
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </Stack>
      </Box>
    </AuthLayout>
  );
}
