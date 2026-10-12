import type { NormalizedBox } from "../types";
import { getDocuments } from "./documents";

/**
 * A grounded span in a specific document. Shaped to line up with `ActiveQuote`
 * so a citation can drive the existing viewer highlight path with no new
 * highlight code: `boxes` null means the viewer falls back to quote search.
 */
export interface QueryCitation {
  document_id: number;
  filename: string;
  page: number;
  quote: string;
  boxes: NormalizedBox[] | null;
}

export interface QueryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: QueryCitation[];
}

/**
 * Ask a question across the indexed documents.
 *
 * TODO(RAG): the body is a mock. Replace with
 *   apiFetch<QueryMessage>("/query", {
 *     method: "POST",
 *     body: JSON.stringify({ question, history }),
 *   })
 * once `api/src/features/RAG/` exposes a route. Backend target:
 *   POST /api/query { question, history?, document_ids? }
 *     -> { id, role: "assistant", content, citations }
 * Keep this signature identical so the swap is a one-line body change.
 */
export async function askQuery(
  question: string,
  history: QueryMessage[],
): Promise<QueryMessage> {
  await new Promise((resolve) => setTimeout(resolve, 800));

  // Cite real uploaded documents so the deep-link path is genuinely exercised
  // rather than pointing at ids that don't exist.
  let citations: QueryCitation[] = [];
  try {
    const documents = await getDocuments();
    citations = documents.slice(0, 2).map((document) => ({
      document_id: document.id,
      filename: document.filename,
      page: 1,
      quote: `Representative passage from ${document.filename}.`,
      boxes: null,
    }));
  } catch {
    // The mock must not fail just because the list call did.
  }

  const turn = history.filter((message) => message.role === "user").length + 1;

  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content:
      `This is a placeholder answer to “${question}” (turn ${turn}). The ` +
      `retrieval backend is not wired up yet — api/src/features/RAG/ is still ` +
      `scaffolding, so no real passages were searched. Citations below point ` +
      `at real uploaded documents so the link-through works.`,
    citations,
  };
}
