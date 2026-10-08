import type { ChecklistItem, ChecklistResponse } from "@agrorende/contracts/checklist";
import { validateChecklistResponse } from "@agrorende/contracts/checklist";

export type ChecklistValue = ChecklistResponse["value"];

export function responseFor(responses: readonly ChecklistResponse[], key: string): ChecklistResponse | undefined {
  return responses.find((r) => r.key === key);
}

export function photoRequired(item: ChecklistItem, response: ChecklistResponse | undefined): boolean {
  return item.photo === "ALWAYS" || item.type === "PHOTO" || (item.photo === "ON_FAIL" && response?.value === "FAIL");
}

/** Answered = valid value and, when a photo is required, at least one media id. */
export function isAnswered(item: ChecklistItem, response: ChecklistResponse | undefined): boolean {
  if (response === undefined) return false;
  if (item.type !== "PHOTO" && !validateChecklistResponse(item, response.value)) return false;
  if (photoRequired(item, response) && response.mediaIds.length === 0) return false;
  return true;
}

export interface ChecklistProgress {
  readonly answered: number;
  readonly total: number;
  readonly requiredMissing: readonly string[];
  readonly complete: boolean;
  readonly safetyFailures: readonly string[];
}

export function checklistProgress(items: readonly ChecklistItem[], responses: readonly ChecklistResponse[]): ChecklistProgress {
  let answered = 0;
  const requiredMissing: string[] = [];
  const safetyFailures: string[] = [];
  for (const item of items) {
    const response = responseFor(responses, item.key);
    if (isAnswered(item, response)) answered += 1;
    else if (item.required) requiredMissing.push(item.key);
    if (item.isSafetyCritical && response?.value === "FAIL") safetyFailures.push(item.key);
  }
  return { answered, total: items.length, requiredMissing, complete: requiredMissing.length === 0, safetyFailures };
}

export function upsertResponse(responses: readonly ChecklistResponse[], next: ChecklistResponse): ChecklistResponse[] {
  const rest = responses.filter((r) => r.key !== next.key);
  return [...rest, next];
}

export function localized(text: Readonly<Record<string, string>>, locale: string): string {
  return text[locale] ?? text["pt-BR"] ?? text.en ?? Object.values(text)[0] ?? "";
}
