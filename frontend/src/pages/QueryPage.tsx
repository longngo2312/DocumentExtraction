import { Alert, Box, Stack } from "@mui/material";
import { useState } from "react";
import type { QueryMessage } from "../api/query";
import { askQuery } from "../api/query";
import PageShell from "../components/layout/PageShell";
import ChatComposer from "../components/query/ChatComposer";
import ChatMessageList from "../components/query/ChatMessageList";
import EmptyChatState from "../components/query/EmptyChatState";

export default function QueryPage() {
  const [messages, setMessages] = useState<QueryMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(question: string) {
    const userMessage: QueryMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      citations: [],
    };
    const history = messages;

    setMessages((previous) => [...previous, userMessage]);
    setPending(true);
    setError(null);

    try {
      const answer = await askQuery(question, history);
      setMessages((previous) => [...previous, answer]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the query service");
    } finally {
      setPending(false);
    }
  }

  return (
    <PageShell
      title="Query"
      subtitle="Ask questions across your extracted documents."
      maxWidth="md"
      fillHeight
    >
      <Stack sx={{ flexGrow: 1, minHeight: 0 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          Retrieval isn&apos;t wired up yet — answers are placeholders. Citations
          link to real uploaded documents.
        </Alert>

        {messages.length === 0 && !pending ? (
          <EmptyChatState onPick={handleSend} />
        ) : (
          <ChatMessageList messages={messages} pending={pending} />
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box sx={{ pt: 2, pb: 1 }}>
          <ChatComposer onSend={handleSend} pending={pending} />
        </Box>
      </Stack>
    </PageShell>
  );
}
