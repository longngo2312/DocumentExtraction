import { unzipSync } from "fflate";
import { ParsingError } from "../parsing.error.js";

/**
 * .docx/.xlsx/.pptx are all zip archives. A pre-2007 .doc renamed to .docx is
 * the case this catches — office-text-extractor used to report it by throwing a
 * message we string-matched on, which went away with the library.
 */
export function assertOoxml(bytes: Uint8Array): void {
  const isZip =
    bytes.length >= 4 &&
    bytes[0] === 0x50 && // P
    bytes[1] === 0x4b && // K
    bytes[2] === 0x03 &&
    bytes[3] === 0x04;

  if (!isZip) {
    throw new ParsingError(
      "unsupported",
      "This file type cannot be read. Save it as .docx, .xlsx or .pptx and upload it again.",
    );
  }
}

/** Zip entries by path. A throw here means the archive itself is damaged. */
export function readZip(bytes: Uint8Array): Record<string, Uint8Array> {
  try {
    return unzipSync(bytes);
  } catch (error) {
    throw new ParsingError(
      "corrupt",
      `This file could not be opened: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
