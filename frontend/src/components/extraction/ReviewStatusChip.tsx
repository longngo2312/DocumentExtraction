import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import HighlightOffIcon from "@mui/icons-material/HighlightOff";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import { Chip } from "@mui/material";
import type { ReviewStatus } from "../../types";

const REVIEW_CHIP = {
  unreviewed: {
    label: "Unreviewed",
    color: "default",
    Icon: RadioButtonUncheckedIcon,
  },
  accepted: {
    label: "Accepted",
    color: "success",
    Icon: CheckCircleOutlineIcon,
  },
  edited: {
    label: "Edited",
    color: "info",
    Icon: EditOutlinedIcon,
  },
  rejected: {
    label: "Rejected",
    color: "error",
    Icon: HighlightOffIcon,
  },
} as const;

interface ReviewStatusChipProps {
  status: ReviewStatus;
  /** Not yet saved — shown outlined so it reads as provisional. */
  pending?: boolean;
}

export default function ReviewStatusChip({
  status,
  pending = false,
}: ReviewStatusChipProps) {
  const chip = REVIEW_CHIP[status];
  const ChipIcon = chip.Icon;

  return (
    <Chip
      icon={<ChipIcon sx={{ fontSize: 14 }} />}
      label={pending ? `${chip.label} \u2022` : chip.label}
      color={chip.color}
      size="small"
      variant={pending || status === "unreviewed" ? "outlined" : "filled"}
      sx={{
        fontWeight: 500,
        "& .MuiChip-icon": { ml: "4px" },
      }}
    />
  );
}
