import { MUTATION_PAYLOADS } from "@agrorende/contracts/mutations";
import type { FieldReportCreatePayload, FieldReportUpdatePayload, FieldReportWithdrawPayload } from "@agrorende/contracts/mutations";
import type { MutationName } from "@agrorende/contracts/sync";

import { ANY_ROLE } from "../../permissions";
import type { MutationHandler } from "../../sync/types";
import { createReport, updateReport, withdraw } from "./service";

const create: MutationHandler<FieldReportCreatePayload> = {
  schema: MUTATION_PAYLOADS["fieldReport.create"] as MutationHandler<FieldReportCreatePayload>["schema"],
  allowedRoles: ANY_ROLE,
  access: "any",
  rejectionCodes: ["VALIDATION_FAILED"],
  async apply(tx, ctx, payload, meta) {
    const result = await createReport(tx, ctx, payload, {
      occurredAt: meta.occurredAt,
      receivedAt: meta.receivedAt,
      clockSkewed: meta.clockSkewed,
      mutationId: meta.mutationId,
      deviceId: meta.deviceId ?? null,
      ...(meta.lat === undefined || meta.lat === null ? {} : { lat: meta.lat }),
      ...(meta.lng === undefined || meta.lng === null ? {} : { lng: meta.lng }),
    });
    return { assigned: { number: result.number } };
  },
};

/** The push pipeline does not enforce `access`, so the service checks that the caller is the reporter. */
const update: MutationHandler<FieldReportUpdatePayload> = {
  schema: MUTATION_PAYLOADS["fieldReport.update"],
  allowedRoles: ANY_ROLE,
  access: "reporter",
  rejectionCodes: ["REPORT_LOCKED", "FORBIDDEN", "NOT_FOUND"],
  async apply(tx, ctx, payload) {
    await updateReport(tx, ctx, payload);
    return {};
  },
};

const withdrawHandler: MutationHandler<FieldReportWithdrawPayload> = {
  schema: MUTATION_PAYLOADS["fieldReport.withdraw"],
  allowedRoles: ANY_ROLE,
  access: "reporter",
  rejectionCodes: ["REPORT_LOCKED", "FORBIDDEN", "NOT_FOUND"],
  async apply(tx, ctx, payload) {
    await withdraw(tx, ctx, payload);
    return {};
  },
};

export const mutations: Pick<Record<MutationName, MutationHandler<unknown>>, "fieldReport.create" | "fieldReport.update" | "fieldReport.withdraw"> = {
  "fieldReport.create": create as MutationHandler<unknown>,
  "fieldReport.update": update as MutationHandler<unknown>,
  "fieldReport.withdraw": withdrawHandler as MutationHandler<unknown>,
};
