import { Box, Button, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import Brand from "../components/layout/Brand";

export default function NotFoundPage() {
  return (
    <Box sx={{ flexGrow: 1, display: "grid", placeItems: "center", p: 4 }}>
      <Stack spacing={2} sx={{ alignItems: "center", textAlign: "center" }}>
        <Brand size={48} showWordmark={false} />
        <Typography variant="h4" component="h1">
          Page not found
        </Typography>
        <Typography variant="body2" color="text.secondary">
          That page doesn&apos;t exist, or it moved.
        </Typography>
        <Button component={RouterLink} to="/schemas" variant="contained" sx={{ mt: 1 }}>
          Back to Schemas
        </Button>
      </Stack>
    </Box>
  );
}
