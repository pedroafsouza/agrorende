import { reject } from "./errors";

export function assertSameOrganization(left: string, right: string): void {
  if (left !== right) {
    reject("FORBIDDEN", { left, right });
  }
}

export function assertFound<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    reject("NOT_FOUND");
  }
  return value;
}
