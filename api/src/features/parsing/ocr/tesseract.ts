import { createWorker } from "tesseract.js";

let workerPromise: ReturnType<typeof createWorker> | null = null;
function getWorker() {
  if (!workerPromise) {
    //Without errorHandler, tesseract.js rethrows worker failures onto the process
    //and takes the whole API down — an unreadable image is enough to do it.
    //recognize() rejects regardless, so callers still see the error.
    workerPromise = createWorker("eng", undefined, { errorHandler: () => {} });
  }
  return workerPromise;
}

export interface OcrWord {
  text: string;
  /** Image pixel space — of whatever image was handed to recognize(). */
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrResult {
  words: OcrWord[];
}

/**
 * Words, not text.
 *
 * data.text is deliberately not returned: callers assemble the page string from
 * these words so offsets and boxes are produced in one pass. Handing back both
 * would let a caller take its text from one source and its geometry from
 * another, which is how highlights end up a few characters off.
 */
export async function OcrImage(png: Uint8Array): Promise<OcrResult> {
  const worker = await getWorker();

  // Without { blocks: true } data.blocks is null and every word box is lost —
  // the default output is text only.
  const res = await worker.recognize(Buffer.from(png), {}, { blocks: true });

  const words: OcrWord[] = [];
  // Null even with the flag set when the page held nothing recognisable.
  for (const block of res.data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        for (const word of line.words) {
          words.push({ text: word.text, bbox: word.bbox });
        }
      }
    }
  }

  return { words };
}

export async function shutdownOcr() {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}
