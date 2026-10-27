import AddIcon from "@mui/icons-material/Add";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import {
  Box,
  CircularProgress,
  IconButton,
  InputBase,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";

interface ComposerProps {
  onSend: (question: string) => void;
  pending?: boolean;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * The one composer: an input over an action row. The dashboard hero and the
 * query page both render this, so the thing you type into is the same control
 * wherever you meet it.
 */
export default function Composer({
  onSend,
  pending = false,
  disabled = false,
  placeholder = "Ask about your documents…",
  autoFocus = false,
}: ComposerProps) {
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
        p: 1.5,
        borderRadius: 3,
        transition: "border-color 180ms ease",
        "&:focus-within": { borderColor: "primary.main" },
      }}
    >
      <InputBase
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends; Shift+Enter is a newline. Without the composition
          // guard this fires mid-word for IME users.
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            send();
          }
        }}
        placeholder={placeholder}
        inputProps={{ "aria-label": placeholder }}
        multiline
        maxRows={8}
        fullWidth
        autoFocus={autoFocus}
        disabled={disabled}
        sx={{ px: 1, py: 0.5, fontSize: "0.95rem" }}
      />

      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", mt: 1, px: 0.5 }}
      >
        <Tooltip title="Upload a document">
          <IconButton
            component={RouterLink}
            to="/upload"
            size="small"
            aria-label="Upload a document"
            sx={{ border: 1, borderColor: "divider" }}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Box sx={{ flexGrow: 1 }} />

        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ display: { xs: "none", sm: "block" } }}
        >
          Enter to send · Shift+Enter for a new line
        </Typography>

        <IconButton
          onClick={send}
          disabled={!canSend}
          aria-label="Send"
          sx={{
            width: 36,
            height: 36,
            bgcolor: canSend ? "primary.main" : "action.disabledBackground",
            color: canSend ? "primary.contrastText" : "text.disabled",
            "&:hover": { bgcolor: canSend ? "primary.dark" : undefined },
          }}
        >
          {pending ? (
            <CircularProgress size={16} color="inherit" />
          ) : (
            <ArrowUpwardIcon fontSize="small" />
          )}
        </IconButton>
      </Stack>
    </Paper>
  );
}
