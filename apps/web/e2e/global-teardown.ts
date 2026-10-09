import { spawnSync } from "node:child_process";

import { OIDC_CONTAINER } from "./support/env";

/** Makes sure the mock OIDC container never outlives the run, even if Playwright killed its client. */
export default function globalTeardown(): void {
  spawnSync("docker", ["rm", "-f", OIDC_CONTAINER], { stdio: "ignore" });
}
