export interface LlmOptions {
  temperature?: number;
  num_predict?: number;
}

export interface LlmRequest {
  system: string;
  prompt: string;
  /**
   * Omit for free-form output. When present, Ollama constrains decoding to it.
   * Never pass `{}` — an empty schema constrains generation to an empty object.
   */
  schema?: Record<string, unknown>;
  /** Spread over the provider defaults, so setting one does not clear the rest. */
  options?: LlmOptions;
}

export interface LlmProvider {
  name: string;
  /** The model name actually used, for provenance columns like document_summaries.model. */
  model: string;
  complete(request: LlmRequest): Promise<unknown>; //parsed Json JSON.parse(result.message.content)
}
