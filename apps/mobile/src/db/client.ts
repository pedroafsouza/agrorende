import { notImplemented } from "../lib/notImplemented";

export type SqlDatabase = unknown;
export type OpenUserDatabaseInput = { readonly userId: string };

export function openUserDatabase(_input: OpenUserDatabaseInput): never {
  return notImplemented("db.openUserDatabase");
}

export function closeUserDatabase(): never {
  return notImplemented("db.closeUserDatabase");
}
