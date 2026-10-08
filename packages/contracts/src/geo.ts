import { z } from "zod";

export const LatitudeSchema = z.number().min(-90).max(90);
export const LongitudeSchema = z.number().min(-180).max(180);
export const AccuracyMetersSchema = z.number().nonnegative();

export const GeoPointSchema = z.object({
  lat: LatitudeSchema,
  lng: LongitudeSchema,
  accuracyM: AccuracyMetersSchema.optional(),
});
export type GeoPoint = z.infer<typeof GeoPointSchema>;

export const QueryDestinationSchema = z.object({
  query: z.string().min(1),
});
export type QueryDestination = z.infer<typeof QueryDestinationSchema>;

export const DestinationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("point"), source: z.enum(["asset", "site", "fieldReport"]), lat: LatitudeSchema, lng: LongitudeSchema, note: z.string().optional() }),
  z.object({ kind: z.literal("query"), source: z.literal("siteAddress"), query: z.string().min(1), note: z.string().optional() }),
]);
export type Destination = z.infer<typeof DestinationSchema>;

export interface ResolveDestinationInput {
  readonly asset?: {
    readonly lat?: number | null;
    readonly lng?: number | null;
  } | null;
  readonly site?: {
    readonly lat?: number | null;
    readonly lng?: number | null;
    readonly address?: string | null;
    readonly city?: string | null;
    readonly state?: string | null;
    readonly name?: string | null;
  } | null;
  readonly fieldReport?: {
    readonly lat?: number | null;
    readonly lng?: number | null;
  } | null;
}

function hasPoint<T extends { readonly lat?: number | null; readonly lng?: number | null }>(input: T | null | undefined): input is T & { readonly lat: number; readonly lng: number } {
  return typeof input?.lat === "number" && typeof input.lng === "number";
}

function siteAddressQuery(site: ResolveDestinationInput["site"]): string | null {
  const parts = [site?.address, site?.city, site?.state].flatMap((part) => {
    const trimmed = part?.trim();
    return trimmed === undefined || trimmed.length === 0 ? [] : [trimmed];
  });
  return parts.length === 0 ? null : parts.join(", ");
}

export function resolveDestination(input: ResolveDestinationInput): Destination | null {
  if (hasPoint(input.asset)) {
    return { kind: "point", source: "asset", lat: input.asset.lat, lng: input.asset.lng };
  }

  const site = input.site;
  if (hasPoint(site)) {
    return { kind: "point", source: "site", lat: site.lat, lng: site.lng, note: site.name ?? undefined };
  }

  const query = siteAddressQuery(input.site);
  if (query !== null) {
    return { kind: "query", source: "siteAddress", query, note: input.site?.name ?? undefined };
  }

  if (hasPoint(input.fieldReport)) {
    return { kind: "point", source: "fieldReport", lat: input.fieldReport.lat, lng: input.fieldReport.lng };
  }

  return null;
}
