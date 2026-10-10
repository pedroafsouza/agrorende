import { AppError, type ErrorCode } from "@agrorende/contracts/errors";

export class DomainError extends AppError {}

export { notImplemented } from "./context";

export function reject(code: ErrorCode, details?: unknown): never {
  throw new DomainError(code, { details });
}
