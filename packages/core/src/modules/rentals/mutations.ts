import { MUTATION_PAYLOADS } from "@agrorende/contracts/mutations";
import type { MutationName } from "@agrorende/contracts/sync";

import { ANY_ROLE } from "../../permissions.js";
import type { MutationHandler } from "../../sync/types.js";
import { stubApply } from "../mutationStub.js";

export const mutations: Pick<Record<MutationName, MutationHandler<unknown>>, "inspection.submit" | "rental.checkout" | "rental.checkin"> = {
  "inspection.submit": { schema: MUTATION_PAYLOADS["inspection.submit"], allowedRoles: ANY_ROLE, access: "any", rejectionCodes: ["RENTAL_NOT_FOUND", "VALIDATION_FAILED"], apply: stubApply("inspection.submit") },
  "rental.checkout": { schema: MUTATION_PAYLOADS["rental.checkout"], allowedRoles: ANY_ROLE, access: "any", rejectionCodes: ["RENTAL_NOT_RESERVED", "RENTAL_ASSET_MISMATCH", "GUARD_CHECKOUT_INCOMPLETE"], apply: stubApply("rental.checkout") },
  "rental.checkin": { schema: MUTATION_PAYLOADS["rental.checkin"], allowedRoles: ANY_ROLE, access: "any", rejectionCodes: ["RENTAL_NOT_ACTIVE", "GUARD_CHECKIN_INCOMPLETE"], apply: stubApply("rental.checkin") },
};
