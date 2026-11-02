import {
  Box,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import Brand from "../layout/Brand";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
  role: String;
  setRole: (value: string) => void;
}

export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  role,
  setRole,
}: AuthLayoutProps) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        py: 6,
        // Tinted wash so the white card reads as a distinct surface.
        // `theme.vars` is only present once cssVariables is on; fall back so
        // this stays valid either way.
        background: (theme) => {
          const palette = theme.vars?.palette ?? theme.palette;
          return `radial-gradient(circle at 50% 0%, color-mix(in srgb, ${palette.primary.light} 13%, transparent), transparent 60%), ${palette.background.default}`;
        },
      }}
    >
      {/* Background box */}
      <Box sx={{ width: "100%", maxWidth: 420 }}>
        {/* Logo + Welcome-back + subtitle stack */}
        <Stack spacing={1} sx={{ alignItems: "center", mb: 3 }}>
          {/*Document Extraction Logo*/}
          <Brand size={50} showWordmark={false} />

          <Typography variant="h5">{title}</Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ textAlign: "center" }}
          >
            {subtitle}
          </Typography>
          {role && setRole && (
            <ToggleButtonGroup
              value={role}
              exclusive
              fullWidth
              onChange={(e, value) => value && setRole(value)}
            >
              <ToggleButton value="user">User</ToggleButton>
              <ToggleButton value="admin">Admin</ToggleButton>
            </ToggleButtonGroup>
          )}
        </Stack>

        <Paper
          variant="outlined"
          sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 3 }}
        >
          {children}
        </Paper>

        <Box sx={{ mt: 3, textAlign: "center" }}>{footer}</Box>
      </Box>
    </Box>
  );
}
