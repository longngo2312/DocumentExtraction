/**
 * Text → vectors via Ollama's batch endpoint. See docs/phase6-rag, Stage 3.
 *
 * The model and its dimension are permanent: they are baked into every stored
 * vector and into the Qdrant collection's `size`. Changing either means a full
 * re-index.
 */

/**
 * Embedding model name. Stamped on every document_chunks row so a model swap
 * is detectable instead of silently returning garbage neighbours.
 */
// TODO: EMBED_MODEL — "nomic-embed-text" (pulled)

/**
 * Vector width. Must match the Qdrant collection's `size`.
 */
// TODO: EMBED_DIMENSIONS — 768 for nomic-embed-text

/**
 * Ollama batch embed endpoint: { model, input: string[] } → { embeddings: number[][] }.
 * Not /api/embeddings — that is the single-input form, one round trip per chunk.
 */
// TODO: OLLAMA_EMBED_URL — http://localhost:11434/api/embed

/**
 * Inputs per request.
 */
// TODO: EMBED_BATCH_SIZE — ~32

/**
 * One vector per input, in input order. Called by indexing (chunk texts) and
 * retrieval (the question).
 */
export async function embed(/* texts: string[] */) {
  // TODO: split texts into batches of EMBED_BATCH_SIZE.
  // TODO: embedBatch() each, concat in order.
  // TODO: return number[][].
}

/**
 * One HTTP call to Ollama for one batch.
 */
async function embedBatch(/* texts: string[] */) {
  // TODO: POST { model: EMBED_MODEL, input: texts, keep_alive: "30m" } —
  //       default 5m means a reload after every coffee break.
  // TODO: network failure → named error. Export describeNetworkError from
  //       extraction/llms/ollama.ts and reuse it.
  // TODO: !response.ok → throw with status + body, same as ollama.ts.
  // TODO: assert embeddings.length === texts.length. A short array silently
  //       misaligns every later vector with its chunk.
  // TODO: assert every vector's length === EMBED_DIMENSIONS.
}
