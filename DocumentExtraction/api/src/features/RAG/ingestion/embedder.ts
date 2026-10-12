/**
 * Text → vectors via Ollama's batch endpoint. See docs/phase6-rag, Stage 3.
 *
 * The model and its dimension are permanent: they are baked into every stored
 * vector and into the Qdrant collection's `size`. Changing either means a full
 * re-index.
 */

import { describeNetworkError } from "../../extraction/llms/ollama.js";

/**
 * Embedding model name. Stamped on every document_chunks row so a model swap
 * is detectable instead of silently returning garbage neighbours.
 */
export const EMBED_MODEL = "nomic-embed-text";

/**
 * Vector width. Must match the Qdrant collection's `size`.
 */
export const EMBED_DIMENSIONS = 768;

/**
 * Ollama batch embed endpoint: { model, input: string[] } → { embeddings: number[][] }.
 * Not /api/embeddings — that is the single-input form, one round trip per chunk.
 */
const OLLAMA_EMBED_URL = "http://localhost:11434/api/embed";

/**
 * Inputs per request.
 */
export const EMBED_BATCH_SIZE = 32;

/**
 * One vector per input, in input order. Called by indexing (chunk texts) and
 * retrieval (the question).
 */
export async function embed(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  // Sequential on purpose: one GPU, parallel batches just queue in Ollama.
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    vectors.push(...(await embedBatch(texts.slice(i, i + EMBED_BATCH_SIZE))));
  }
  return vectors;
}

/**
 * One HTTP call to Ollama for one batch.
 */
async function embedBatch(texts: string[]): Promise<number[][]> {
  let response: Response;
  try {
    response = await fetch(OLLAMA_EMBED_URL, {
      method: "POST",
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: texts,
        // Default 5m means a reload after every coffee break.
        keep_alive: "30m",
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    throw new Error(describeNetworkError(error));
  }

  if (!response.ok) {
    throw new Error(`Ollama embed ${response.status}: ${await response.text()}`);
  }

  const { embeddings } = (await response.json()) as { embeddings: number[][] };

  // A short array silently misaligns every later vector with its chunk.
  if (embeddings?.length !== texts.length) {
    throw new Error(
      `Ollama embed returned ${embeddings?.length} vectors for ${texts.length} inputs`,
    );
  }
  for (const vector of embeddings) {
    if (vector.length !== EMBED_DIMENSIONS) {
      throw new Error(
        `Ollama embed returned a ${vector.length}-dim vector, expected ${EMBED_DIMENSIONS} — wrong model?`,
      );
    }
  }

  return embeddings;
}
