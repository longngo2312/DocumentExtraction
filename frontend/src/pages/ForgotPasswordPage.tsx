import { Alert, Box, Button, Link as MuiLink, Stack, Typography } from "@mui/material";
import type React from "react";
import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import AuthLayout from "../components/auth/AuthLayout";
import LabeledField from "../components/auth/LabeledField";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // ponytail: UI only — no reset endpoint yet. When it exists, POST the email
  // here and replace the notice with the design's "Check your email" screen.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email on your account and we'll send a reset link. If you signed up with GitHub or Google, log in through that provider instead."
      footer={
        <Typography variant="body2">
          <MuiLink component={RouterLink} to="/login" sx={{ fontWeight: 600, fontSize: 14 }}>
            Back to log in
          </MuiLink>
        </Typography>
      }
    >
      <Box component="form" onSubmit={handleSubmit}>
        <Stack sx={{ gap: 2 }}>
          {submitted && (
            <Alert severity="info">
              Password reset emails aren't set up yet, so nothing was sent. Ask an admin to reset your password.
            </Alert>
          )}
          <LabeledField
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button type="submit" variant="contained" fullWidth sx={{ height: 44, fontSize: 14, fontWeight: 600 }}>
            Send reset link
          </Button>
        </Stack>
      </Box>
    </AuthLayout>
  );
}
