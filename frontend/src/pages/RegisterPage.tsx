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
import { register } from "../api/auth";
import AuthLayout from "../components/auth/AuthLayout";
import LabeledField from "../components/auth/LabeledField";
import OAuthButtons from "../components/auth/OAuthButtons";
import PasswordField from "../components/auth/PasswordField";
import { useAuthStore } from "../stores/authStore";

const MIN_PASSWORD_LENGTH = 8;

// 0 empty, 1 too short, 2 no digit, 3 digit but no symbol, 4 digit + symbol.
function passwordScore(pw: string) {
  if (!pw) return 0;
  if (pw.length < MIN_PASSWORD_LENGTH) return 1;
  if (!/[0-9]/.test(pw)) return 2;
  return /[^A-Za-z0-9]/.test(pw) ? 4 : 3;
}
const SCORE_COLOR = ["divider", "error.main", "warning.main", "primary.main", "success.main"];
const SCORE_LABEL = [
  "Use at least 8 characters.",
  "Too short — at least 8 characters.",
  "Fair — add a number.",
  "Good — add a symbol to make it strong.",
  "Strong password.",
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [confirm, setConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Length rule mirrors isValidPassword on the API so the user isn't told after a round trip.
  const score = passwordScore(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = terms && password.length >= MIN_PASSWORD_LENGTH && confirm === password;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
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
        <Typography color="text.secondary" sx={{ fontSize: 14 }}>
          Already have an account?{" "}
          <MuiLink component={RouterLink} to="/login" sx={{ fontWeight: 600 }}>
            Log in
          </MuiLink>
        </Typography>
      }
    >
      <Stack sx={{ gap: "22px" }}>
        <Box component="form" onSubmit={handleSubmit}>
          <Stack sx={{ gap: 1.75 }}>
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

            <LabeledField
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={loading}
              required
            />

            <Stack spacing={0.75}>
              <PasswordField
                value={password}
                onChange={setPassword}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                disabled={loading}
              />
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.5 }}>
                {[1, 2, 3, 4].map((i) => (
                  <Box
                    key={i}
                    sx={{
                      height: 4,
                      borderRadius: 0.5,
                      bgcolor: i <= score ? SCORE_COLOR[score] : "divider",
                    }}
                  />
                ))}
              </Box>
              <Typography color="text.secondary" sx={{ fontSize: 12 }} aria-live="polite">
                {SCORE_LABEL[score]}
              </Typography>
            </Stack>

            <PasswordField
              label="Confirm password"
              placeholder=""
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              disabled={loading}
              error={mismatch}
              helperText={mismatch ? "Passwords don't match." : undefined}
            />

            {/* ponytail: plain text until Terms/Privacy pages exist — then make these links. */}
            <FormControlLabel
              sx={{ ml: 0, gap: 1.25, alignItems: "flex-start" }}
              control={
                <Checkbox
                  checked={terms}
                  onChange={(e) => setTerms(e.target.checked)}
                  disabled={loading}
                  size="small"
                  sx={{ p: 0, mt: "1px" }}
                />
              }
              label={
                <Typography color="text.secondary" sx={{ fontSize: 13, lineHeight: 1.45 }}>
                  I agree to the Terms of Service and Privacy Policy.
                </Typography>
              }
            />

            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={loading || !canSubmit}
              startIcon={loading && <CircularProgress size={14} color="inherit" />}
              sx={{ height: 44, fontSize: 14, fontWeight: 600 }}
            >
              {loading ? "Creating account…" : "Create account"}
            </Button>
          </Stack>
        </Box>

        <OAuthButtons
          dividerText="or sign up with"
          disabled={loading}
          onPick={(p) => setNotice(`${p} sign-up isn't available yet.`)}
        />
        {notice && <Alert severity="info">{notice}</Alert>}
      </Stack>
    </AuthLayout>
  );
}
