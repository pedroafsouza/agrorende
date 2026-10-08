import type { Role } from "@agrorende/contracts/enums";

export type HomeWidgetId = "duty" | "quickReport" | "nextJob" | "rentalsToday" | "myReports" | "sync";

/** Today widgets per role (ARCHITECTURE §13.2). Location-tracked field users see the duty switch first. */
export function homeWidgetsFor(role: Role | undefined, input: { readonly hasPendingOrFailed: boolean }): readonly HomeWidgetId[] {
  const widgets: HomeWidgetId[] = role === "FIELD" ? ["duty"] : [];
  widgets.push("quickReport", "nextJob", "rentalsToday", "myReports");
  if (input.hasPendingOrFailed) widgets.push("sync");
  return widgets;
}
