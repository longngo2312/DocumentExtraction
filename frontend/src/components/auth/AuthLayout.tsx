import {
  Box,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import reviewScreenshot from "../../assets/auth-review.png";
import Brand from "../layout/Brand";

export type AuthRole = "user" | "admin";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
  role?: AuthRole;
  setRole?: (value: AuthRole) => void;
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
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
      }}
    >
      {/* Left: the form on paper */}
      <Box
        sx={{
          bgcolor: "background.paper",
          display: "flex",
          flexDirection: "column",
          px: { xs: 2, sm: 5 },
          py: 3.5,
          gap: 4,
        }}
      >
        <Brand size={30} />

        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Stack sx={{ width: "100%", maxWidth: 380, gap: "22px" }}>
            <Stack spacing={0.75}>
              <Typography
                component="h1"
                sx={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15 }}
              >
                {title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                {subtitle}
              </Typography>
            </Stack>

            {role && setRole && (
              <ToggleButtonGroup
                value={role}
                exclusive
                fullWidth
                onChange={(_, value: AuthRole | null) => value && setRole(value)}
                sx={{
                  p: "3px",
                  gap: "2px",
                  borderRadius: 2,
                  bgcolor: "surface.sunken",
                  border: 1,
                  borderColor: "divider",
                  "& .MuiToggleButton-root": {
                    height: 34,
                    border: 0,
                    borderRadius: "6px !important",
                    textTransform: "none",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "text.secondary",
                  },
                  "& .MuiToggleButton-root.Mui-selected, & .MuiToggleButton-root.Mui-selected:hover": {
                    bgcolor: "background.paper",
                    color: "text.primary",
                    boxShadow: 1,
                  },
                }}
              >
                <ToggleButton value="user">User</ToggleButton>
                <ToggleButton value="admin">Admin</ToggleButton>
              </ToggleButtonGroup>
            )}

            {children}

            <Box sx={{ textAlign: "center" }}>{footer}</Box>
          </Stack>
        </Box>

        <Typography variant="caption" color="text.secondary">
          © 2026 DocExtract
        </Typography>
      </Box>

      {/* Right: recessed product panel, hidden on narrow screens */}
      <Box
        sx={{
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          justifyContent: "center",
          gap: 4,
          p: 7,
          bgcolor: "surface.sunken",
          borderLeft: 1,
          borderColor: "divider",
        }}
      >
        <Stack spacing={1.5}>
          <Typography
            sx={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "primary.main",
            }}
          >
            Document extraction
          </Typography>
          <Typography
            component="h2"
            sx={{
              fontSize: 32,
              lineHeight: 1.15,
              fontWeight: 700,
              letterSpacing: "-0.025em",
              textWrap: "pretty",
            }}
          >
            Define a schema once. Pull the same fields from every document.
          </Typography>
          <Typography
            color="text.secondary"
            sx={{ fontSize: 15, lineHeight: 1.55, textWrap: "pretty" }}
          >
            Upload PDFs, review extracted values next to the source, and query
            across everything you've processed.
          </Typography>
        </Stack>

        <Box
          component="img"
          src={reviewScreenshot}
          alt="Reviewing extracted values next to the highlighted source document"
          sx={{
            width: "100%",
            aspectRatio: "16 / 10",
            objectFit: "cover",
            objectPosition: "top left",
            borderRadius: 3,
            border: 1,
            borderColor: "divider",
          }}
        />
      </Box>
    </Box>
  );
}
