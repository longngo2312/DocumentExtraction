import { Box, Chip, Stack, Typography } from "@mui/material";
import Brand from "../layout/Brand";

const STARTERS = [
  "What are the key dates across my documents?",
  "Summarise the invoices I uploaded this month.",
  "Which documents mention a renewal clause?",
  "What totals were extracted, and from where?",
];

interface EmptyChatStateProps {
  onPick: (question: string) => void;
}

export default function EmptyChatState({ onPick }: EmptyChatStateProps) {
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
          Every answer cites the passage it came from, so you can check it against
          the original.
        </Typography>

        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ flexWrap: "wrap", justifyContent: "center", mt: 1 }}
        >
          {STARTERS.map((starter) => (
            <Chip
              key={starter}
              label={starter}
              variant="outlined"
              onClick={() => onPick(starter)}
              sx={{ cursor: "pointer", height: "auto", py: 0.75 }}
            />
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}
