import { Box, Skeleton, Stack } from "@mui/material";
import { useEffect, useRef } from "react";
import type { QueryMessage } from "../../api/query";
import Brand from "../layout/Brand";
import ChatMessage from "./ChatMessage";

interface ChatMessageListProps {
  messages: QueryMessage[];
  pending: boolean;
}

export default function ChatMessageList({
  messages,
  pending,
}: ChatMessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending]);

  return (
    <Box sx={{ flexGrow: 1, overflowY: "auto", px: { xs: 0, sm: 1 } }}>
      {/* Answers arrive asynchronously and are the whole point of the page, so
          they have to be announced rather than only painted. */}
      <Stack spacing={3} aria-live="polite" aria-busy={pending}>
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {pending && (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
            <Box sx={{ pt: 0.25 }}>
              <Brand size={28} showWordmark={false} />
            </Box>
            <Box sx={{ flexGrow: 1, maxWidth: 420 }}>
              <Skeleton width="90%" />
              <Skeleton width="75%" />
              <Skeleton width="40%" />
            </Box>
          </Stack>
        )}
      </Stack>

      <div ref={endRef} />
    </Box>
  );
}
