import { Chip, Tooltip } from "@mui/material";
import type { Support } from "../../types";

type ChipColor = "success" | "warning" | "error" | "default";

interface ChipSpec {
  label: string;
  color: ChipColor;
  help: string;
}

/**
 * The null entry is the important one. A field whose grounding check never ran
 * must not look like a field that passed it — Stage 7 swallows grounding errors
 * so a whole document can arrive here with every verdict null.
 */
const SPEC: Record<Support | "null", ChipSpec> = {
  entailed: {
    label: "entailed",
    color: "success",
    help: "A second model, shown only the quote, reached the same answer from it.",
  },
  partial: {
    label: "partial",
    color: "warning",
    help: "The quote points toward this answer but does not settle it. Worth a look.",
  },
  unsupported: {
    label: "unsupported",
    color: "warning",
    help: "The quote is about the right subject but does not justify this specific answer.",
  },
  contradicted: {
    label: "contradicted",
    color: "error",
    help: "The quote points to a different answer than the one given. Check this one.",
  },
  null: {
    label: "not verified",
    color: "default",
    help: "The grounding check did not run for this field. This is not a pass — the inference is simply unchecked.",
  },
};

interface GroundingChipProps {
  support: Support | null;
}

export default function GroundingChip({ support }: GroundingChipProps) {
  const spec = SPEC[support ?? "null"];

  return (
    <Tooltip title={spec.help} enterDelay={400}>
      <Chip
        label={spec.label}
        size="small"
        color={spec.color}
        variant={spec.color === "default" ? "outlined" : "filled"}
        sx={{
          height: 18,
          fontSize: "0.6rem",
          fontWeight: 600,
          "& .MuiChip-label": { px: 0.75 },
        }}
      />
    </Tooltip>
  );
}
