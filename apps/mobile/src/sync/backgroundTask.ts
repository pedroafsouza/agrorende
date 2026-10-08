import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

import { hasSyncRuntime } from "./runtime";
import type { SyncEngine } from "./engine";

export const BACKGROUND_SYNC_TASK = "agrorende.background-sync";

let engineRef: Pick<SyncEngine, "syncNow"> | undefined;

/** The signed-in session hands its engine over so the OS task can run a cycle (P1 trigger). */
export function setBackgroundSyncEngine(engine: Pick<SyncEngine, "syncNow"> | undefined): void {
  engineRef = engine;
}

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  if (engineRef === undefined || !hasSyncRuntime()) return BackgroundTask.BackgroundTaskResult.Success;
  try {
    const result = await engineRef.syncNow("background");
    return result.ok || result.offline === true ? BackgroundTask.BackgroundTaskResult.Success : BackgroundTask.BackgroundTaskResult.Failed;
  } catch (_error) {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<void> {
  try {
    if (!(await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK))) {
      await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: 15 });
    }
  } catch (_error) {
    // Background execution is best effort; foreground triggers still drain the outbox.
  }
}
