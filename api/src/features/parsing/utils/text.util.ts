import type { ParsedPage } from "../types.js";

/**
 * Only text.parser.ts may use this now.
 *
 * Every other parser assembles its page text alongside span offsets, and any
 * rewrite after the fact shifts those offsets — trailing-space stripping and
 * newline collapsing both delete characters. See the invariant in
 * docs/phase5-provenance-spans.md.
 */
export function normalizeWhiteSpace(text: string): string {
  //1. convert Windows line endings to Unix line endings
  text = text.replace(/\r\n/g, "\n");

  //2. Remove trailing spaces/tabs from each line
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");

  //3. Collapse 3+ consecutive newlines into 2
  text = text.replace(/\n{3,}/g, "\n\n");
  return text;
}

/**
 * The document-level string handed to the LLM.
 *
 * The page number stays first in the marker: SYSTEM_PROMPT tells the model to
 * read it out of here, and a label is only ever extra context for it.
 */
export function joinPages(
  pages: Pick<ParsedPage, "text" | "label">[],
): string {
  return pages
    .map((page, i) => {
      if (i === 0) return page.text;
      const marker = page.label
        ? `--- page ${i + 1} (${page.label}) ---`
        : `--- page ${i + 1} ---`;
      return `${marker}\n\n${page.text}`;
    })
    .join("\n\n");
}

export function hasUsableText(pageText: string, min = 100): boolean {
  return pageText.trim().length >= min;
}
