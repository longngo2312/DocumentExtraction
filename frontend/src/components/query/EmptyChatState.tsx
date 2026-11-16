import { Box, Stack, Typography } from "@mui/material";
import Brand from "../layout/Brand";

// interface EmptyChatStateProps {
//   onPick: (question: string) => void;
// }

export default function EmptyChatState() {
  return (
    <Box
      sx={{
        flexGrow: 1,
        display: "grid",
        placeItems: "center",
        px: 2,
        py: 6,
      }}
    >
      <Stack spacing={2.5} sx={{ alignItems: "center", maxWidth: 560 }}>
        <Brand size={48} showWordmark={false} />
        <Typography variant="h5" sx={{ textAlign: "center" }}>
          Ask across your documents
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ textAlign: "center" }}
        >
          Every answer cites the passage it came from, so you can check it
          against the original.
        </Typography>
      </Stack>
    </Box>
  );
}
