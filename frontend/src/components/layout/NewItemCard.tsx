import AddIcon from "@mui/icons-material/Add";
import { Box, ButtonBase, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";

interface NewItemCardProps {
  to: string;
  label: string;
}

/**
 * The dashed "start something" tile that leads every collection grid. It is
 * the same height as a ContentCard so the first row stays level.
 */
export default function NewItemCard({ to, label }: NewItemCardProps) {
  return (
    <ButtonBase
      component={RouterLink}
      to={to}
      sx={{
        width: "100%",
        height: "100%",
        minHeight: 220,
        borderRadius: 2,
        border: "1px dashed",
        borderColor: "divider",
        color: "text.secondary",
        transition: "border-color 180ms ease, color 180ms ease, background-color 180ms ease",
        "&:hover": {
          borderColor: "primary.main",
          color: "primary.main",
          bgcolor: "action.hover",
        },
      }}
    >
      <Stack spacing={1.5} sx={{ alignItems: "center" }}>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            bgcolor: "surface.sunken",
            border: 1,
            borderColor: "divider",
            color: "inherit",
          }}
        >
          <AddIcon />
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 600, color: "inherit" }}>
          {label}
        </Typography>
      </Stack>
    </ButtonBase>
  );
}
