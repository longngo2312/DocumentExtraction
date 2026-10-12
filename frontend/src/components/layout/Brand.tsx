import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import { Box, Stack, Typography } from "@mui/material";

interface BrandProps {
  /** Edge length of the mark in px. */
  size?: number;
  showWordmark?: boolean;
}

/**
 * The product mark. Single source of truth — the auth screens and the sidebar
 * both render this, so they cannot drift apart.
 */
export default function Brand({ size = 32, showWordmark = true }: BrandProps) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: size >= 44 ? 2.5 : 1.5,
          display: "grid",
          placeItems: "center",
          bgcolor: "primary.main",
          color: "primary.contrastText",
          flexShrink: 0,
        }}
      >
        <DescriptionOutlinedIcon sx={{ fontSize: size * 0.55 }} />
      </Box>

      {showWordmark && (
        <Typography
          variant="subtitle1"
          sx={{
            fontFamily: '"Space Grotesk", "DM Sans", sans-serif',
            fontWeight: 600,
            letterSpacing: "-0.02em",
            whiteSpace: "nowrap",
          }}
        >
          DocExtract
        </Typography>
      )}
    </Stack>
  );
}
