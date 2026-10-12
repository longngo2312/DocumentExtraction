export class DocumentError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
