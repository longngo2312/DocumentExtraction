/**
 * Every setting comes from api/.env and none has a default, so a missing one
 * stops the API here — with its name — instead of surfacing later as a request
 * to `undefined/api/chat` or a login that can never verify.
 *
 * Import this before anything else (server.ts does): modules read process.env
 * as they load.
 */

const REQUIRED = [
  "PORT",
  "CORS_ORIGIN",
  "JWT_SECRET",
  "OLLAMA_URL",
  "OLLAMA_MODEL",
  "QDRANT_URL",
] as const;

declare global {
  namespace NodeJS {
    // Checked below, so the rest of the code can read them as plain strings.
    interface ProcessEnv extends Record<(typeof REQUIRED)[number], string> {}
  }
}

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(
    `Missing environment variables: ${missing.join(", ")}. ` +
      "Copy api/.env.example to api/.env and fill them in.",
  );
}

export {};
