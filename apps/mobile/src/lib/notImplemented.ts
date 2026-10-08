import { AppError } from "@agrorende/contracts/errors";

export function notImplemented(feature: string): never {
  throw new AppError("INTERNAL", { message: "NOT_IMPLEMENTED", details: { feature } });
}
