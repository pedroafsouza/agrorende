import { AppError, type ErrorCode } from "@agrorende/contracts/errors";

export class DomainError extends AppError {}

export function notImplemented(feature: string): never {
  throw new AppError("INTERNAL", { message: "NOT_IMPLEMENTED", details: { feature } });
}

export function reject(code: ErrorCode, details?: unknown): never {
  throw new DomainError(code, { details });
}
