import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import { Box, IconButton, Tooltip } from "@mui/material";
import type { ReactNode } from "react";
import type { ReviewStatus } from "../../types";

interface ReviewActionsProps {
  status: ReviewStatus;
  onAccept: () => void;
  onEdit: () => void;
  onReject: () => void;
  /** Named so the buttons announce which field they act on. */
  fieldName?: string;
}

interface Action {
  label: string;
  /** The status this button puts the field into — also when it reads as "on". */
  activeStatus: ReviewStatus;
  color: "success" | "secondary" | "error";
  icon: ReactNode;
}

const ACTIONS: Action[] = [
  { label: "Accept", activeStatus: "accepted", color: "success", icon: <CheckIcon sx={{ fontSize: 16 }} /> },
  { label: "Edit", activeStatus: "edited", color: "secondary", icon: <EditIcon sx={{ fontSize: 16 }} /> },
  { label: "Reject", activeStatus: "rejected", color: "error", icon: <CloseIcon sx={{ fontSize: 16 }} /> },
];

export default function ReviewActions({
  status,
  onAccept,
  onEdit,
  onReject,
  fieldName,
}: ReviewActionsProps) {
  const handlers = { accepted: onAccept, edited: onEdit, rejected: onReject } as const;

  return (
    <Box
      role="group"
      aria-label={fieldName ? `Review ${fieldName}` : "Review actions"}
      sx={{
        display: "inline-flex",
        gap: "2px",
        bgcolor: "surface.sunken",
        borderRadius: 1.5,
        p: "2px",
      }}
    >
      {ACTIONS.map((action) => {
        const on = status === action.activeStatus;
        return (
          <Tooltip key={action.label} title={action.label} arrow>
            <IconButton
              size="small"
              onClick={handlers[action.activeStatus as keyof typeof handlers]}
              aria-label={
                fieldName ? `${action.label} ${fieldName}` : action.label
              }
              aria-pressed={on}
              sx={{
                borderRadius: 1,
                width: 30,
                height: 30,
                transition: "all 150ms ease",
                ...(on
                  ? {
                      bgcolor: `${action.color}.main`,
                      color: `${action.color}.contrastText`,
                      "&:hover": { bgcolor: `${action.color}.dark` },
                    }
                  : {
                      color: "text.secondary",
                      "&:hover": {
                        bgcolor: "action.hover",
                        color: `${action.color}.main`,
                      },
                    }),
              }}
            >
              {action.icon}
            </IconButton>
          </Tooltip>
        );
      })}
    </Box>
  );
}
