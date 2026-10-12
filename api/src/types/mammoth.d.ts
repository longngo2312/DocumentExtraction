/**
 * mammoth ships no type declarations and there is no @types/mammoth on npm
 * (404, checked 2026-08-30). Only the surface the docx parser uses is declared.
 */
declare module "mammoth" {
  interface Message {
    type: string;
    message: string;
  }

  interface Result {
    value: string;
    messages: Message[];
  }

  interface Input {
    buffer?: Buffer;
    path?: string;
  }

  export function extractRawText(input: Input): Promise<Result>;
  export function convertToHtml(input: Input): Promise<Result>;
}
