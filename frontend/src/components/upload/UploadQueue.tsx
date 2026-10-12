import { Box, Button, Stack, Typography } from "@mui/material";
import type { UploadItem } from "../../types";
import UploadQueueItem from "./UploadQueueItem";

interface UploadQueueProps {
  items: UploadItem[];
  onRetry: (item: UploadItem) => void;
  onRemove: (id: string) => void;
  onClearFinished: () => void;
}

export default function UploadQueue({
  items,
  onRetry,
  onRemove,
  onClearFinished,
}: UploadQueueProps) {
  if (items.length === 0) return null;

  const doneCount = items.filter((item) => item.status === "done").length;

  return (
    <Box sx={{ mt: 4 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1.5,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Queue ({doneCount}/{items.length})
        </Typography>

        {doneCount > 0 && (
          <Button size="small" onClick={onClearFinished}>
            Clear uploaded
          </Button>
        )}
      </Box>

      <Stack spacing={1}>
        {items.map((item) => (
          <UploadQueueItem
            key={item.id}
            item={item}
            onRetry={onRetry}
            onRemove={onRemove}
          />
        ))}
      </Stack>
    </Box>
  );
}
