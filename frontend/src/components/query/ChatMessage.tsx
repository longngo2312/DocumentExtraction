import { Avatar, Box, Paper, Stack, Typography } from "@mui/material";
import type { QueryMessage } from "../../api/query";
import { useAuthStore } from "../../stores/authStore";
import Brand from "../layout/Brand";
import CitationChip from "./CitationChip";
import SourcesList from "./SourcesList";

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
          {message.content}
          {message.citations.map((citation, index) => (
            <CitationChip
              key={`${citation.document_id}-${index}`}
              citation={citation}
              index={index}
            />
          ))}
        </Typography>
        <SourcesList citations={message.citations} />
      </Box>
    </Stack>
  );
}
