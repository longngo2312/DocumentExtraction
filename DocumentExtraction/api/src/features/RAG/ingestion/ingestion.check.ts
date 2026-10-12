/**
 * Runnable checks for the two ingestion defects that fail silently.
 *
 *   npx tsx src/features/RAG/ingestion/ingestion.check.ts
 *
 * No framework on purpose — same convention as extraction.check.ts.
 */

import assert from "node:assert/strict";
import type { ParsedPage } from "../../parsing/types.js";
import { chunkPages } from "./chunker.js";
import { EMBED_BATCH_SIZE, EMBED_DIMENSIONS, embed } from "./embedder.js";

/**
 * The chunk invariant. If this fails, every citation downstream highlights
 * the wrong text. Needs nothing running.
 */
function checkChunkInvariant() {
  const para =
    "Revenue grew twelve percent year over year. Costs fell in every region! " +
    "Was the outlook stable? Management said yes, with caveats on supply. ";
  const page = (n: number, text: string): ParsedPage => ({
    text, page: n, source: "text", spans: [], width: 1, height: 1,
  });
  const pages = [page(1, (para.repeat(4) + "\n\n").repeat(6)), page(2, "Page 2 of 2")];

  const chunks = chunkPages(pages, new Map());

  assert.ok(chunks.filter((c) => c.page === 1).length > 1, "long page split");
  chunks.forEach((c, i) => {
    assert.equal(c.chunkIndex, i);
    assert.equal(pages[c.page - 1].text.slice(c.charStart, c.charEnd), c.text);
    assert.ok(c.text.length <= 1200);
  });
  assert.ok(!chunks.some((c) => c.page === 2), "footer-only page skipped");
  console.log(`chunk invariant ok (${chunks.length} chunks)`);
}

/**
 * Vector/input alignment across a batch boundary. Needs Ollama with
 * nomic-embed-text pulled.
 */
async function checkEmbedAlignment() {
  const texts = Array.from({ length: EMBED_BATCH_SIZE + 8 }, (_, i) => `passage ${i}`);
  const vectors = await embed(texts);

  assert.equal(vectors.length, texts.length);
  assert.ok(vectors.every((v) => v.length === EMBED_DIMENSIONS));
  console.log(`embed alignment ok (${vectors.length} vectors)`);
}

checkChunkInvariant();
await checkEmbedAlignment();
