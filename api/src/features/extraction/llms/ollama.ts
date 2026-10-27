import { LlmProvider, LlmRequest } from "./dtos.js";
const OLLAMA_BASE = process.env.OLLAMA_URL.replace(/\/+$/, "");
/** Whichever chat model this machine has pulled and has the VRAM for. */
const OLLAMA_MODEL = process.env.OLLAMA_MODEL;
const OLLAMA_URL = `${OLLAMA_BASE}/api/chat`;
/** The batch endpoint — not /api/embeddings, which is one round trip per input. */
const OLLAMA_EMBED_URL = `${OLLAMA_BASE}/api/embed`;

/**
 * The embedding model and its width are permanent: both are baked into every
 * stored vector and into the Qdrant collection's `size`. Changing either means
 * a full re-index. The name is stamped on every document_chunks row so a swap
 * is detectable instead of silently returning garbage neighbours.
 */
export const EMBED_MODEL = "nomic-embed-text";
export const EMBED_DIMENSIONS = 768;
const EMBED_BATCH_SIZE = 32;

/**
 * undici reports an unreachable host as a bare "fetch failed", and a timeout as
 * "The operation was aborted". Neither says which service, so the message
 * surfaces in the document grid as if the parser had broken. Name the actual
 * failure instead — this is the most common way extraction stops working.
 */
export function describeNetworkError(error: unknown): string {
  const name = (error as { name?: string })?.name;
  if (name === "TimeoutError" || name === "AbortError") {
    return `Ollama did not respond within 120s. The model may still be loading — check \`ollama ps\`.`;
  }
  return (
    `Cannot reach Ollama at ${OLLAMA_URL}. Is it running? Start it with \`ollama serve\`. ` +
    `(${error instanceof Error ? error.message : String(error)})`
  );
}

/**
 * One POST to an Ollama endpoint, with the failure handling every caller needs:
 * a named network error, and a 404 (model not pulled) marked permanent so the
 * worker does not retry it three times.
 */
async function postOllama<T>(url: string, body: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    // Retryable on purpose: Ollama being down is a transient condition, not a
    // bad document.
    throw new Error(describeNetworkError(error));
  }

  if (!response.ok) {
    const msg = await response.text();
    const err = new Error(`Ollama ${response.status}: ${msg}`);
    (err as any).permanent = response.status === 404;
    throw err;
  }

  return (await response.json()) as T;
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * Free-text chat — the RAG answer, which is prose with [n] markers rather than
 * a JSON object, so it cannot go through `complete`. Sampling defaults are the
 * answer's: 0.2 reads less flat than 0, and 800 tokens is a long answer that
 * still leaves the 8192 window room for five passages and history.
 */
export async function chat(
  messages: ChatMessage[],
  options: Record<string, number> = {},
): Promise<string> {
  const result = await postOllama<{ message: { content: string } }>(OLLAMA_URL, {
    model: OLLAMA_MODEL,
    messages,
    stream: false,
    keep_alive: "30m",
    options: { temperature: 0.2, num_ctx: 8192, num_predict: 800, ...options },
  });
  return result.message.content;
}

/**
 * nomic-embed-text is trained with a task prefix on every input, and retrieves
 * noticeably worse without one. Like the model itself this is permanent: a
 * passage indexed with one prefix must be searched with its pair. Applied here
 * rather than by callers so neither side can forget it.
 */
const EMBED_PREFIX = {
  document: "search_document: ",
  query: "search_query: ",
} as const;

/**
 * One vector per input, in input order. Indexing embeds chunk texts as
 * "document", retrieval embeds the question as "query" — both must come through
 * here, or the question and the passages land in different vector spaces.
 */
export async function embed(
  texts: string[],
  kind: keyof typeof EMBED_PREFIX,
): Promise<number[][]> {
  const vectors: number[][] = [];
  // Sequential on purpose: one GPU, so parallel batches only queue in Ollama.
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts
      .slice(i, i + EMBED_BATCH_SIZE)
      .map((text) => EMBED_PREFIX[kind] + text);
    const { embeddings } = await postOllama<{ embeddings: number[][] }>(
      OLLAMA_EMBED_URL,
      // Default 5m means the first question after a break pays a model reload.
      { model: EMBED_MODEL, input: batch, keep_alive: "30m" },
    );

    // A short array does not fail loudly — it silently pairs every later
    // vector with the wrong chunk. Check the count on every batch.
    if (embeddings?.length !== batch.length) {
      throw new Error(
        `Ollama embed returned ${embeddings?.length} vectors for ${batch.length} inputs`,
      );
    }
    if (embeddings.some((vector) => vector.length !== EMBED_DIMENSIONS)) {
      throw new Error(
        `Ollama embed returned a non-${EMBED_DIMENSIONS}-dim vector — is ${EMBED_MODEL} the model pulled?`,
      );
    }
    vectors.push(...embeddings);
  }
  return vectors;
}

export const OllamaProvider: LlmProvider = {
  name: "ollama",
  model: OLLAMA_MODEL,
  async complete(request: LlmRequest): Promise<unknown> {
    const result = await postOllama<{ message: { content: string } }>(OLLAMA_URL, {
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.prompt },
      ],
      ...(request.schema ? { format: request.schema } : {}),
      stream: false,
      keep_alive: "30m",
      options: {
        temperature: 0,
        num_ctx: 8192, // 6GB VRAM ceiling — see docs/phase6, do not raise
        num_predict: 2048,
        // Caller's options win, but only the keys it actually set.
        ...request.options,
      },
    });
    const content = result.message.content;

    try {
      return JSON.parse(content);
    } catch {
      // Retryable on purpose — no `permanent` flag. The usual cause is
      // num_predict running out mid-object, which a retry at a smaller input
      // budget can survive.
      throw new Error(
        `Ollama returned unparseable JSON (${content.length} chars). ` +
          `Most likely num_predict ran out mid-object — see the token budget in ` +
          `docs/phase6-insight-extraction-and-summary.md.`,
      );
    }
  },
};
