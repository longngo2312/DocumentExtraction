import { Chip } from "@mui/material";
import type { DocumentStatus } from "../../types";

// Every DocumentStatus needs an entry — a missing key reads as undefined and
// throws on chip.label rather than degrading to a plain chip.
const STATUS_CHIP = {
  uploaded: { label: "Uploaded", color: "default" },
  processing: { label: "Processing", color: "info" },
  extracted: { label: "Extracted", color: "success" },
  reviewed: { label: "Reviewed", color: "primary" },
  indexed: { label: "Indexed", color: "secondary" },
  failed: { label: "Failed", color: "error" },
} as const;

interface DocumentStatusChipProps {
  status: DocumentStatus;
}

export default function DocumentStatusChip({
  status,
}: DocumentStatusChipProps) {
  const chip = STATUS_CHIP[status];

  return (
    <Chip
      label={chip.label}
      color={chip.color}
      size="small"
      variant={status === "uploaded" ? "outlined" : "filled"}
      sx={{
        fontWeight: 600,
        fontSize: "0.65rem",
        height: 22,
        letterSpacing: "0.02em",
      }}
    />
  );
}
