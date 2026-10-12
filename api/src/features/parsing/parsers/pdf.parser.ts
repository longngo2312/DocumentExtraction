import { createCanvas } from "@napi-rs/canvas";
import fs from "fs";
import { createRequire } from "module";
import nodePath from "path";
import { getDocument, Util } from "pdfjs-dist/legacy/build/pdf.mjs";
import type {
  PDFPageProxy,
  TextItem,
} from "pdfjs-dist/types/src/display/api.js";
import { OcrImage } from "../ocr/tesseract.js";
import { ParsingError } from "../parsing.error.js";
import type {
  ParsedPage,
  ParsedSpan,
  ParseMethod,
  ParserResult,
} from "../types.js";
import {
  createSpanIdCounter,
  normalizeBox,
  pageFromWords,
} from "../utils/spans.util.js";
import { hasUsableText, joinPages } from "../utils/text.util.js";

const MIN_CHARS_PER_PAGE = 100;
const OCR_PAGE_CAP = 20;
const OCR_SCALE = 3;

/**
 * pdfjs loads the Base-14 font data (Helvetica, Times, Courier) and the CJK
 * character maps from disk, and without these it renders those glyphs wrong —
 * silently, with only a console warning. A hybrid page that mixes a little text
 * with images then OCRs to mangled text.
 *
 * Resolved from the installed package rather than hardcoded. Plain filesystem
 * paths, not file:// URLs — in Node the legacy build reads these straight off
 * disk and a URL makes it report the font as unloadable. Forward slashes on
 * purpose: pdfjs asserts the value ends in "/", which path.sep does not satisfy
 * on Windows.
 */
const pdfjsRoot = nodePath
  .dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"))
  .replace(/\\/g, "/");
const STANDARD_FONT_DATA_URL = `${pdfjsRoot}/standard_fonts/`;
const CMAP_URL = `${pdfjsRoot}/cmaps/`;

/**
 * pdfjs 5.4 does not re-export PasswordException, so it cannot be reached with
 * instanceof. The name is stable and is what pdf-parse matched on too.
 */
function isPasswordError(error: unknown): boolean {
  return (error as { name?: string })?.name === "PasswordException";
}

/**
 * Rasterize one page for OCR.
 *
 * Deliberately pdfjs rather than pdf-parse's getScreenshot: the two libraries
 * carry their own pdfjs and fight over Node's Path2D global, so a render that
 * follows our own text pass throws "Value is none of these types String, Path".
 * That only ever happens on scanned PDFs, which is the worst place to find it.
 */
async function renderPage(
  page: PDFPageProxy,
  scale: number,
): Promise<{ png: Uint8Array; width: number; height: number }> {
  const viewport = page.getViewport({ scale });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);

  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  // PDF pages are transparent; OCR on a transparent-as-black bitmap reads nothing.
  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);

  await page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;

  return { png: new Uint8Array(canvas.toBuffer("image/png")), width, height };
}

export async function getPdfText(path: string): Promise<ParserResult> {
  const data = new Uint8Array(fs.readFileSync(path));

  const warning: string[] = [];
  const nextSpanId = createSpanIdCounter();
  const pages: ParsedPage[] = [];

  let doc;
  try {
    // getDocument detaches `data` into the worker — nothing else may read it
    // afterwards.
    doc = await getDocument({
      data,
      useWorkerFetch: false,
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
      cMapUrl: CMAP_URL,
      cMapPacked: true,
    }).promise;
  } catch (error) {
    throw new ParsingError(
      isPasswordError(error) ? "encrypted" : "corrupt",
      isPasswordError(error)
        ? "This PDF is password-protected. Remove the password and upload it again."
        : `This PDF could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    //Pass 1 — the embedded text layer, with a span per text item
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      try {
        // scale 1 gives points, with /Rotate already applied.
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();

        const spans: ParsedSpan[] = [];
        let text = "";

        for (const raw of content.items) {
          // items is Array<TextItem | TextMarkedContent>; the latter carries
          // only { type, id } and has no str to append.
          if (!("str" in raw)) continue;
          const item = raw as TextItem;

          const start = text.length;
          text += item.str;
          const end = text.length;

          // The transform composition lands in device space — y-down, top-left
          // origin — so there is no y-flip or /Rotate case to hand-roll.
          const m = Util.transform(viewport.transform, item.transform);

          // m[5] is the text baseline, not the top edge. Reading it as y0 puts
          // every highlight one line-height too high, uniformly enough to look
          // deliberate.
          const height = item.height || Math.hypot(m[2], m[3]);

          // pdfjs emits whitespace-only items between words. Their text still
          // has to land in the page string — every later offset depends on it —
          // but a span for a space is noise in spanIds and its box would widen
          // the line rect for nothing.
          if (item.str.trim()) {
            spans.push({
              id: nextSpanId(),
              start,
              end,
              bbox: normalizeBox(
                m[4],
                m[5] - height,
                m[4] + item.width,
                m[5],
                viewport.width,
                viewport.height,
              ),
            });
          }

          // The newline belongs to no span, but still moves every later offset.
          if (item.hasEOL) text += "\n";
        }

        pages.push({
          page: pageNumber,
          text,
          source: "text",
          spans,
          width: viewport.width,
          height: viewport.height,
        });
      } finally {
        page.cleanup();
      }
    }

    //Pass 2 — which pages have too little text to be anything but a scan
    const needOCR = pages.filter(
      (p) => !hasUsableText(p.text, MIN_CHARS_PER_PAGE),
    );

    if (needOCR.length > 0) {
      const toOcr = needOCR.slice(0, OCR_PAGE_CAP);
      if (needOCR.length > toOcr.length) {
        warning.push(
          `Scanned document: only the first ${toOcr.length} of ${needOCR.length} were read`,
        );
      }

      for (const p of toOcr) {
        try {
          const page = await doc.getPage(p.page);
          let shot;
          try {
            shot = await renderPage(page, OCR_SCALE);
          } finally {
            page.cleanup();
          }

          const { words } = await OcrImage(shot.png);

          // The word boxes are in the rendered bitmap's pixel space, not the
          // page's points — normalizing against the viewport would land every
          // highlight at a third of its size, up and to the left.
          const assembled = pageFromWords(
            words,
            shot.width,
            shot.height,
            nextSpanId,
          );

          if (!assembled.text.trim()) {
            warning.push(`Page ${p.page} is an image with no readable text.`);
            continue;
          }

          //p is the same object pages holds, so this updates both
          p.text = assembled.text;
          p.spans = assembled.spans;
          p.width = shot.width;
          p.height = shot.height;
          p.source = "ocr";
        } catch (error) {
          warning.push(
            `Page ${p.page} could not be read: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  } finally {
    await doc.destroy();
  }

  //what actually happened, counted off the finished pages
  const ocrCount = pages.filter((p) => p.source === "ocr").length;
  const method: ParseMethod =
    ocrCount === 0
      ? "pdf-text"
      : ocrCount === pages.length
        ? "pdf-ocr"
        : "pdf-hybrid";

  //glue the pages back together
  const text = joinPages(pages);
  if (!text.trim()) {
    throw new ParsingError(
      "empty",
      "No text could be read from this PDF. It may be blank, or a scan too poor to read.",
    );
  }

  return { text, pages, pageCount: pages.length, method, warning };
}
