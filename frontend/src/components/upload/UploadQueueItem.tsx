import CloseIcon from "@mui/icons-material/Close";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Box,
  Chip,
  IconButton,
  LinearProgress,
  Paper,
  Tooltip,
  Typography,
} from "@mui/material";
import type { UploadItem } from "../../types";
import { formatBytes } from "../../utils/format";

const STATUS_CHIP = {
  pending: { label: "Pending", color: "default" },
  uploading: { label: "Uploading", color: "info" },
  done: { label: "Uploaded", color: "success" },
  error: { label: "Failed", color: "error" },
} as const;

interface UploadQueueItemProps {
  item: UploadItem;
  onRetry: (item: UploadItem) => void;
  onRemove: (id: string) => void;
}

export default function UploadQueueItem({
  item,
  onRetry,
  onRemove,
}: UploadQueueItemProps) {
  const chip = STATUS_CHIP[item.status];
  const busy = item.status === "uploading";

  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {item.file.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatBytes(item.file.size)}
          </Typography>
        </Box>

        <Chip
          label={chip.label}
          color={chip.color}
          size="small"
          variant={item.status === "pending" ? "outlined" : "filled"}
          sx={{ flexShrink: 0 }}
        />

        {item.status === "error" && (
          <Tooltip title="Retry">
            <IconButton
              size="small"
              aria-label={`Retry upload of ${item.file.name}`}
              onClick={() => onRetry(item)}
              sx={{ flexShrink: 0 }}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        <Tooltip title="Remove from queue">
          {/* Tooltip needs a non-disabled child to keep its own listeners. */}
          <span>
            <IconButton
              size="small"
              disabled={busy}
              aria-label={`Remove ${item.file.name} from queue`}
              onClick={() => onRemove(item.id)}
              sx={{ flexShrink: 0 }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {busy && <LinearProgress sx={{ mt: 1 }} />}

      {item.status === "error" && item.error && (
        <Typography variant="caption" color="error" sx={{ mt: 0.5, display: "block" }}>
          {item.error}
        </Typography>
      )}
    </Paper>
  );
}
