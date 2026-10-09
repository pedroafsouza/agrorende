/**
 * Start-up guard for production processes (ARCHITECTURE §18.1, change request T18-003).
 *
 * Web, realtime and worker call `assertProductionEnv()` before serving anything. Outside
 * `APP_ENV=production` it does nothing. In production it refuses to start when the identity
 * providers are not the real ones, the database is not MongoDB Atlas or a required secret is
 * missing. `infra/scripts/validate-env.sh` applies the same rules to the rendered `.env` before a
 * deploy; this check also stops a container that is started by hand with a wrong environment.
 * The message names the variables only, never their values.
 */

export const PRODUCTION_REQUIRED_SECRETS = [
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
  "AUTH_ENCRYPTION_KEY",
  "JWT_SECRET",
  "MEDIA_URL_SECRET",
] as const;

export type EnvSource = Readonly<Record<string, string | undefined>>;

function value(env: EnvSource, name: string): string {
  return (env[name] ?? "").trim();
}

/** Every rule the environment breaks; empty when it is not production or when it is valid. */
export function productionEnvProblems(env: EnvSource = process.env): string[] {
  if (value(env, "APP_ENV") !== "production") return [];
  const problems: string[] = [];
  if (value(env, "GOOGLE_OIDC_ISSUER") !== "https://accounts.google.com") {
    problems.push("GOOGLE_OIDC_ISSUER must be https://accounts.google.com");
  }
  if (value(env, "APPLE_OIDC_ISSUER") !== "https://appleid.apple.com") {
    problems.push("APPLE_OIDC_ISSUER must be https://appleid.apple.com");
  }
  if (!value(env, "MONGODB_URI").startsWith("mongodb+srv://")) {
    problems.push("MONGODB_URI must be a MongoDB Atlas mongodb+srv:// address");
  }
  const missing = PRODUCTION_REQUIRED_SECRETS.filter((name) => value(env, name) === "");
  if (missing.length > 0) problems.push(`missing ${missing.join(", ")}`);
  return problems;
}

/** Throws with every broken rule listed when `APP_ENV=production` and the environment is unsafe. */
export function assertProductionEnv(service: string, env: EnvSource = process.env): void {
  const problems = productionEnvProblems(env);
  if (problems.length > 0) {
    throw new Error(`${service} refuses to start with APP_ENV=production: ${problems.join("; ")}`);
  }
}
