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
      {/* The page's single scroll region — the transcript scrolls here,
          inside the content panel, and nothing else on the page scrolls. */}
      <Box sx={{ flexGrow: 1, minHeight: 0, overflowY: "auto" }}>
        <Container
          maxWidth="md"
          sx={{
            px: { xs: 2, sm: 3 },
            py: 3,
            // Lets the empty state centre itself against the panel rather
            // than sitting at the top of a short page.
            minHeight: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Scrolls away with the conversation — it is a caveat about the
              answers, not permanent chrome worth a strip of every screen. */}
          <Alert severity="info" variant="outlined" sx={{ mb: 3 }}>
            Retrieval isn&apos;t wired up yet — answers are placeholders.
            Citations link to real uploaded documents.
          </Alert>

          {messages.length === 0 && !pending ? (
            <EmptyChatState onPick={handleSend} />
          ) : (
            <ChatMessageList messages={messages} pending={pending} />
          )}
        </Container>
      </Box>

      {/* The composer floats on the panel rather than sitting on a full-bleed
          bar — the transcript runs under it and keeps the panel's ground. */}
      <Box sx={{ flexShrink: 0, px: { xs: 2, sm: 3 }, pt: 1, pb: 2 }}>
        <Container maxWidth="md" disableGutters>
          <Stack spacing={1}>
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            <Composer
              onSend={handleSend}
              pending={pending}
              autoFocus
              placeholder="Ask a follow-up…"
            />
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}
