export class ParsingError extends Error {
  constructor(
    public code: "unsupported" | "corrupt" | "empty" | "encrypted",
    message: string,
  ) {
    super(message);
  }
}
