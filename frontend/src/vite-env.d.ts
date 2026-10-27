/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The API's base URL, from frontend/.env. Required — client.ts stops if it's missing. */
  readonly VITE_API_URL: string;
}
