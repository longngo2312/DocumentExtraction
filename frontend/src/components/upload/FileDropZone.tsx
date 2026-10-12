import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import { Paper, Stack, Typography } from "@mui/material";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";

interface FileDropZoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  accept?: string;
  hint?: string;
}

export default function FileDropZone({
  onFiles,
  disabled,
  accept,
  hint,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Dragging over a child fires dragleave on the parent, so a plain boolean
  // flickers. Counting enters and leaves keeps the highlight steady.
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);

  function clearDragState() {
    dragDepth.current = 0;
    setDragging(false);
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) return;
    dragDepth.current += 1;
    setDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    // Without this the browser opens the file instead of firing onDrop.
    event.preventDefault();
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) return;
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) clearDragState();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    clearDragState();
    if (disabled) return;

    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  }

  function handleBrowse(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) onFiles(files);
    // Reset so picking the same file twice in a row still fires onChange.
    event.target.value = "";
  }

  return (
    <Paper
      variant="outlined"
      onClick={() => !disabled && inputRef.current?.click()}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        p: 5,
        textAlign: "center",
        borderStyle: "dashed",
        borderWidth: 2,
        borderColor: dragging ? "primary.main" : "divider",
        bgcolor: dragging ? "action.hover" : "background.paper",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "border-color 150ms, background-color 150ms",
        "&:hover": { borderColor: disabled ? "divider" : "primary.main" },
      }}
    >
      <input
        type="file"
        multiple
        hidden
        accept={accept}
        ref={inputRef}
        onChange={handleBrowse}
        disabled={disabled}
      />

      <Stack spacing={1} sx={{ alignItems: "center" }}>
        <CloudUploadOutlinedIcon color={dragging ? "primary" : "action"} />
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {dragging ? "Drop to add" : "Drag files here or click to browse"}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}
