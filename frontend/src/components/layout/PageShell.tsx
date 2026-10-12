import { Box, Container, Stack, Typography } from "@mui/material";
import type { Breakpoint } from "@mui/material";
import type { ReactNode } from "react";

interface PageShellProps {
  title: string;
  subtitle?: ReactNode;
  /** Right-aligned header content — usually the page's primary button. */
  actions?: ReactNode;
  maxWidth?: Breakpoint | false;
  /** Let the content region fill the viewport (the review split view needs this). */
  fillHeight?: boolean;
  children: ReactNode;
}

/**
 * Page chrome: width, padding, and the title/actions header. Replaces the
 * identical Container + h4 + flex-row block that three pages each hand-rolled.
 */
export default function PageShell({
  title,
  subtitle,
  actions,
  maxWidth = "md",
  fillHeight = false,
  children,
}: PageShellProps) {
  return (
    <Container
      maxWidth={maxWidth}
      sx={{
        py: { xs: 3, sm: 4 },
        px: { xs: 2, sm: 3 },
        flexGrow: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        width: "100%",
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
          gap: 2,
          mb: 3,
          flexShrink: 0,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" component="h1">
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {actions && <Box sx={{ flexShrink: 0 }}>{actions}</Box>}
      </Stack>

      <Box
        sx={
          fillHeight
            ? { flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column" }
            : undefined
        }
      >
        {children}
      </Box>
    </Container>
  );
}
