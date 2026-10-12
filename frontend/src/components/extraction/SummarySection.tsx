import { Box, Typography } from "@mui/material";

interface SummarySectionProps {
  title: string;
  items: string[];
  /** Accent for the bullet marker — caveats read as warnings, findings as neutral. */
  accent?: string;
}

/** Titled bullet list. Renders nothing when empty rather than an empty heading. */
export default function SummarySection({
  title,
  items,
  accent = "text.disabled",
}: SummarySectionProps) {
  if (items.length === 0) return null;

  return (
    <Box>
      <Typography
        variant="overline"
        component="div"
        color="text.secondary"
        sx={{ mb: 0.75 }}
      >
        {title}
      </Typography>

      <Box component="ul" sx={{ m: 0, pl: 0, listStyle: "none" }}>
        {items.map((item, index) => (
          <Box
            component="li"
            key={index}
            sx={{ display: "flex", gap: 1, mb: 0.75, alignItems: "flex-start" }}
          >
            <Box
              sx={{
                flexShrink: 0,
                width: 4,
                height: 4,
                borderRadius: "50%",
                bgcolor: accent,
                mt: "7px",
              }}
            />
            <Typography
              variant="body2"
              sx={{ fontSize: "0.8125rem", lineHeight: 1.5 }}
            >
              {item}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
