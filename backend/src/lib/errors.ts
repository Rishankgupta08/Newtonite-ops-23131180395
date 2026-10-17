export class HttpError extends Error {
  statusCode: number;
  code?: string;
  currentItem?: unknown;

  constructor(statusCode: number, message: string, code?: string, currentItem?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.currentItem = currentItem;
  }
}
