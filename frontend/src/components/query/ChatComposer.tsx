import SendIcon from "@mui/icons-material/Send";
import {
  Box,
  CircularProgress,
  IconButton,
  Paper,
  TextField,
} from "@mui/material";
import { useState } from "react";

interface ChatComposerProps {
  onSend: (question: string) => void;
  pending: boolean;
  disabled?: boolean;
}

export default function ChatComposer({
  onSend,
  pending,
  disabled = false,
}: ChatComposerProps) {
  const [value, setValue] = useState("");
  const canSend = value.trim().length > 0 && !pending && !disabled;

  function send() {
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1,
        display: "flex",
        alignItems: "flex-end",
        gap: 1,
        borderRadius: 3,
        bgcolor: "background.paper",
      }}
    >
      <TextField
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends; Shift+Enter is a newline. Without the composition
          // guard this fires mid-word for IME users.
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            send();
          }
        }}
        placeholder="Ask about your documents…"
        aria-label="Ask about your documents"
        multiline
        maxRows={6}
        fullWidth
        disabled={disabled}
        variant="standard"
        slotProps={{ input: { disableUnderline: true } }}
        sx={{ px: 1, py: 0.5 }}
      />

      <Box sx={{ position: "relative", flexShrink: 0 }}>
        <IconButton
          onClick={send}
          disabled={!canSend}
          aria-label="Send question"
          color="primary"
          sx={{
            width: 44,
            height: 44,
            bgcolor: canSend ? "primary.main" : "transparent",
            color: canSend ? "primary.contrastText" : "text.disabled",
            "&:hover": { bgcolor: canSend ? "primary.dark" : "action.hover" },
          }}
        >
          {pending ? <CircularProgress size={18} /> : <SendIcon fontSize="small" />}
        </IconButton>
      </Box>
    </Paper>
  );
}
