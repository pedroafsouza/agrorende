/** Next.js start-up hook: production refuses to start with an unsafe environment (change request T18-003). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertProductionEnv } = await import("@agrorende/core/startup");
  assertProductionEnv("web");
}
