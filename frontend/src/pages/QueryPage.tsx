import { Alert, Box, Container, Stack } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { QueryMessage } from "../api/query";
import { askQuery } from "../api/query";
import ChatMessageList from "../components/query/ChatMessageList";
import Composer from "../components/query/Composer";
import EmptyChatState from "../components/query/EmptyChatState";

export default function QueryPage() {
  const [messages, setMessages] = useState<QueryMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The dashboard composer hands its question over in router state rather than
  // answering it there, so the conversation starts in one place.
  const location = useLocation();
  const incoming = (location.state as { question?: string } | null)?.question;

  // Mirrors `messages` so handleSend can read the history without taking it as
  // a dependency — a new handleSend on every message would re-run the effect
  // below and, but for its guard, resend the handed-over question.
  const messagesRef = useRef<QueryMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const handleSend = useCallback(async function handleSend(question: string) {
    const userMessage: QueryMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      citations: [],
    };

    // The transcript as the model should see it — read from the ref rather
    // than from a state updater, which React may run twice.
    const history = messagesRef.current;

    setMessages((previous) => [...previous, userMessage]);
    setPending(true);
    setError(null);

    try {
      const answer = await askQuery(question, history);
      setMessages((previous) => [...previous, answer]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not reach the query service",
      );
    } finally {
      setPending(false);
    }
  }, []);

  // Fire the handed-over question exactly once. Without the ref StrictMode's
  // double-invoke in development sends it twice.
  const sentIncoming = useRef(false);
  useEffect(() => {
    if (incoming && !sentIncoming.current) {
      sentIncoming.current = true;
      handleSend(incoming);
    }
  }, [incoming, handleSend]);

  return (
    <Box
      sx={{
        flexGrow: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ flexGrow: 1, minHeight: 0, overflow: "auto" }}>
        <Container maxWidth="md" sx={{ px: { xs: 2, sm: 3 }, py: 3 }}>
          {messages.length === 0 && !pending ? (
            <EmptyChatState onPick={handleSend} />
          ) : (
            <ChatMessageList messages={messages} pending={pending} />
          )}
        </Container>
      </Box>

      {/* Pinned below the transcript, as in a chat client — the composer does
          not scroll away with the conversation. */}
      <Box
        sx={{
          flexShrink: 0,
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "background.default",
        }}
      >
        <Container maxWidth="md" sx={{ px: { xs: 2, sm: 3 }, py: 2 }}>
          <Stack spacing={1.5}>
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            <Composer
              onSend={handleSend}
              pending={pending}
              autoFocus
              placeholder="Ask about your documents…"
            />

            <Alert severity="info" variant="outlined" sx={{ py: 0 }}>
              Retrieval isn&apos;t wired up yet — answers are placeholders.
              Citations link to real uploaded documents.
            </Alert>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}
