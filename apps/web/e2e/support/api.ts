import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { SEED_PASSWORD, WEB_URL } from "./env";
import { clearLoginLimits, testIp } from "./limits";

export interface ApiSession {
  readonly token: string;
  readonly userId: string;
  readonly orgId: string;
  readonly role: string;
  readonly deviceId: string;
}

export type Json = Record<string, unknown>;

export interface MutationInput {
  readonly name: string;
  readonly payload: Json;
  readonly occurredAt?: string;
}

export interface MutationResult {
  readonly id: string;
  readonly status: "APPLIED" | "REJECTED" | "RETRY";
  readonly code?: string;
  readonly message?: string;
  readonly assigned?: { readonly number?: string };
}

/** A 8 × 8 JPEG, small enough to inline and valid for the media pipeline. */
export const TINY_JPEG = Buffer.from(
  "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCQACJl/9k=",
  "base64",
);

/** A unique suffix so every spec run creates its own records (T11 AC: unique names). */
export function unique(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** A random, check-digit-valid CPF, because customer tax ids are unique per organisation. */
export function randomCpf(): string {
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (digits.every((digit) => digit === digits[0])) digits[0] = ((digits[0] ?? 0) + 1) % 10;
  for (const length of [9, 10]) {
    const sum = digits.slice(0, length).reduce((total, digit, index) => total + digit * (length + 1 - index), 0);
    const rest = (sum * 10) % 11;
    digits.push(rest === 10 ? 0 : rest);
  }
  return digits.join("");
}

async function body(response: APIResponse): Promise<Json> {
  const text = await response.text();
  return text === "" ? {} : (JSON.parse(text) as Json);
}

/**
 * Talks to the E2E API with bearer tokens, the way the mobile app does (`POST /auth/login` with a
 * `deviceId`). Specs use it to arrange data and to make "another user" changes while a page is open.
 */
export class Api {
  private constructor(
    private readonly request: APIRequestContext,
    readonly session: ApiSession,
  ) {}

  static async login(request: APIRequestContext, email: string, password = SEED_PASSWORD): Promise<Api> {
    const deviceId = randomUUID();
    const ip = testIp();
    await clearLoginLimits(email, ip);
    const response = await request.post(`${WEB_URL}/api/v1/auth/login`, {
      data: { email, password, deviceId, platform: "ANDROID" },
      headers: { "x-forwarded-for": ip },
    });
    expect(response.status(), `login ${email}`).toBe(200);
    const json = await body(response);
    const user = json.user as Json;
    const org = json.org as Json;
    return new Api(request, { token: String(json.accessToken), userId: String(user.id), orgId: String(org.id), role: String(user.role), deviceId });
  }

  private headers(extra: Readonly<Record<string, string>> = {}): Record<string, string> {
    return { authorization: `Bearer ${this.session.token}`, accept: "application/json", ...extra };
  }

  async raw(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, data?: unknown, headers?: Readonly<Record<string, string>>): Promise<APIResponse> {
    return this.request.fetch(`${WEB_URL}/api/v1${path}`, { method, headers: this.headers(headers), ...(data === undefined ? {} : { data }) });
  }

  async get(path: string): Promise<Json> {
    const response = await this.raw("GET", path);
    expect(response.status(), `GET ${path}: ${await response.text()}`).toBe(200);
    return body(response);
  }

  async send(method: "POST" | "PATCH" | "PUT" | "DELETE", path: string, data?: unknown, expected: readonly number[] = [200, 201, 202, 204]): Promise<Json> {
    const response = await this.raw(method, path, data);
    expect(expected, `${method} ${path} -> ${response.status()} ${await response.text()}`).toContain(response.status());
    return body(response);
  }

  /** One sync push batch, like the mobile outbox (ARCHITECTURE §7). */
  async push(mutations: readonly MutationInput[]): Promise<MutationResult[]> {
    const now = new Date().toISOString();
    const items = mutations.map((mutation) => ({ id: randomUUID(), name: mutation.name, occurredAt: mutation.occurredAt ?? now, payload: mutation.payload }));
    const json = await this.send("POST", "/sync/push", {
      deviceId: this.session.deviceId,
      clientTime: now,
      deviceStatus: { appVersion: "e2e", runtimeVersion: "e2e", pendingMutations: items.length, pendingUploads: 0, pendingBytes: 0, scopeEpoch: 0 },
      mutations: items,
    });
    const results = (json.results ?? []) as MutationResult[];
    return items.map((item) => results.find((result) => result.id === item.id) ?? { id: item.id, status: "RETRY" as const });
  }

  /** Pushes mutations and fails the test unless every one was applied. */
  async apply(mutations: readonly MutationInput[]): Promise<MutationResult[]> {
    const results = await this.push(mutations);
    for (const [index, result] of results.entries()) {
      expect(result.status, `${mutations[index]?.name ?? "mutation"}: ${result.code ?? ""} ${result.message ?? ""}`).toBe("APPLIED");
    }
    return results;
  }

  async assetByCode(code: string): Promise<Json> {
    const json = await this.get(`/assets?q=${encodeURIComponent(code)}&limit=5`);
    const items = (json.items ?? []) as Json[];
    const asset = items.find((item) => item.code === code);
    expect(asset, `asset ${code}`).toBeDefined();
    return asset as Json;
  }

  /** Finds a record of a list endpoint (`/work-orders`, `/rentals`, …) by its human number. */
  async byNumber(path: string, number: string): Promise<Json> {
    const json = await this.get(`${path}?q=${encodeURIComponent(number)}&limit=50`);
    const item = ((json.items ?? []) as Json[]).find((candidate) => candidate.number === number);
    expect(item, `${path} ${number}`).toBeDefined();
    return item as Json;
  }

  /** Creates an asset with a unique code, so a spec never collides with seeded open jobs or rentals. */
  async createAsset(input: { readonly name: string; readonly category?: string; readonly rentable?: boolean }): Promise<Json> {
    const code = `E2E-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase()}`;
    return this.send("POST", "/assets", {
      code,
      name: input.name,
      category: input.category ?? "TRACTOR",
      ownerType: "ORGANIZATION",
      isRentable: input.rentable ?? false,
      defaultRateCents: input.rentable === true ? 50_000 : null,
      defaultRateUnit: input.rentable === true ? "DAY" : null,
    });
  }

  async createCustomer(input: { readonly name: string; readonly phone?: string | null }): Promise<Json> {
    return this.send("POST", "/customers", {
      name: input.name,
      taxId: randomCpf(),
      ...(input.phone === null ? {} : { phone: input.phone ?? "+5516999800001" }),
      email: "e2e-customer@example.com",
      city: "Ribeirão Preto",
      state: "SP",
    });
  }

  /** Creates a field report through sync push as a FIELD user and returns its id and number. */
  async createReport(input: { readonly assetId: string; readonly title: string; readonly priority?: string; readonly category?: string; readonly suggestedAction?: string }): Promise<{ id: string; number: string }> {
    const id = randomUUID();
    const [result] = await this.apply([
      {
        name: "fieldReport.create",
        payload: {
          id,
          assetId: input.assetId,
          category: input.category ?? "ENGINE",
          priority: input.priority ?? "HIGH",
          machineOperable: false,
          suggestedAction: input.suggestedAction ?? "REPAIR_NOW",
          title: input.title,
          description: `${input.title}. Created by the web E2E suite.`,
          media: [],
        },
      },
    ]);
    return { id, number: result?.assigned?.number ?? "" };
  }
}
