export class APIError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503,
    public code: string,
    message: string
  ) {
    super(message)
  }
}
export function fail(
  status: APIError['status'],
  code: string,
  message: string
): never {
  throw new APIError(status, code, message)
}
