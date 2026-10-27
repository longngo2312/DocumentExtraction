import { Alert, Avatar, Box, Paper, Stack, Typography } from "@mui/material";
import { Fragment } from "react";
import type { QueryCitation, QueryMessage } from "../../api/query";
import { useAuthStore } from "../../stores/authStore";
import Brand from "../layout/Brand";
import CitationChip from "./CitationChip";
import SourcesList from "./SourcesList";

/**
 * Turns the answer's [n] markers into chips where they stand. The server has
 * already dropped any marker without a source and renumbered the rest 1..N in
 * citation order, so [n] is always citations[n - 1]; one that somehow is not
 * stays as plain text rather than linking somewhere wrong.
 */
function withCitationChips(content: string, citations: QueryCitation[]) {
  return content.split(/(\[\d+\])/g).map((part, i) => {
    const n = /^\[(\d+)\]$/.exec(part)?.[1];
    const citation = n ? citations[Number(n) - 1] : undefined;
    return citation ? (
      <CitationChip key={i} citation={citation} index={Number(n) - 1} />
    ) : (
      <Fragment key={i}>{part}</Fragment>
    );
  });
}

interface ChatMessageProps {
  message: QueryMessage;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const user = useAuthStore((s) => s.user);
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ justifyContent: "flex-end", alignItems: "flex-start" }}
      >
        <Paper
          variant="outlined"
          sx={{
            px: 2,
            py: 1.25,
            maxWidth: { xs: "100%", sm: "80%" },
            bgcolor: "surface.activeRow",
            borderRadius: 2,
          }}
        >
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
            {message.content}
          </Typography>
        </Paper>
        <Avatar
          sx={{
            width: 28,
            height: 28,
            fontSize: 13,
            bgcolor: "primary.main",
            color: "primary.contrastText",
          }}
        >
          {user?.username?.[0]?.toUpperCase() ?? "?"}
        </Avatar>
      </Stack>
    );
  }

  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
      <Box sx={{ pt: 0.25 }}>
        <Brand size={28} showWordmark={false} />
      </Box>
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>
          {withCitationChips(message.content, message.citations)}
        </Typography>

        {message.ungrounded && (
          <Alert severity="warning" variant="outlined" sx={{ mt: 1.5, py: 0 }}>
            This answer doesn&apos;t cite any of the passages that were found.
            Treat it as unverified.
          </Alert>
        )}

        <SourcesList citations={message.citations} />
      </Box>
    </Stack>
  );
}
