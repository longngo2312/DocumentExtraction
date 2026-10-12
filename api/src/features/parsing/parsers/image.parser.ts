import { loadImage } from "@napi-rs/canvas";
import fs from "fs";
import { OcrImage } from "../ocr/tesseract.js";
import { ParsingError } from "../parsing.error.js";
import type { ParserResult } from "../types.js";
import { createSpanIdCounter, pageFromWords } from "../utils/spans.util.js";

export async function getImageText(path: string): Promise<ParserResult> {
  //get image from uploaded file => turn into machine readable type
  const image = new Uint8Array(fs.readFileSync(path));

  let words;
  let width: number;
  let height: number;
  try {
    // The OCR boxes are in the image's own pixel space, so its real dimensions
    // are the denominator. Decoded rather than assumed — a JPEG carrying an EXIF
    // orientation flag is the case that punishes a guess.
    const decoded = await loadImage(Buffer.from(image));
    width = decoded.width;
    height = decoded.height;

    //clean the text extracted from OCR
    words = (await OcrImage(image)).words;
  } catch (error) {
    //throw error if image can't be read
    throw new ParsingError(
      "corrupt",
      `This image could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const { text, spans } = pageFromWords(
    words,
    width,
    height,
    createSpanIdCounter(),
  );

  //empty text meaning there was nothing to extract from the image
  if (!text.trim()) {
    throw new ParsingError(
      "empty",
      "No text could be found in this image. It may contain no writing, or be too blurry to read.",
    );
  }

  //One image is one page, so the chunker sees the same shape as a PDF.
  return {
    text,
    pages: [{ page: 1, text, source: "ocr", spans, width, height }],
    pageCount: 1,
    method: "image-ocr",
    warning: [],
  };
}
