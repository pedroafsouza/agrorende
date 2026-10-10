import { render, screen, within } from "@testing-library/react-native";
import type { UserDTO } from "@agrorende/contracts";

import { countPendingWork, listDeviceUsers, type DeviceUserSources } from "../../src/auth/deviceUsers";
import type { CachedProfile } from "../../src/auth/session";
import { DeviceUsersCard } from "../../src/auth/ui/DeviceUsersCard";
import { openUserDatabase } from "../../src/db/client";
import type { SqlDb } from "../../src/db/sql";
import { createComment } from "../../src/sync/mutators/comments";
import { createSyncRuntime, setSyncRuntime, type SyncRuntime } from "../../src/sync/runtime";
import { createSyncStore } from "../../src/sync/store";
import { FakeServer } from "../helpers/fakeServer";
import { memoryHost } from "../helpers/nodeSqlite";
import { DEVICE_ID, testId } from "../helpers/runtime";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }), useLocalSearchParams: () => ({}) }));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(async () => undefined), impactAsync: jest.fn(async () => undefined), selectionAsync: jest.fn(async () => undefined), NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));

const JOANA = "01900000-0000-7000-8000-0000000000a1";
const CARLOS = "01900000-0000-7000-8000-0000000000a2";

async function runtimeFor(userId: string): Promise<SyncRuntime> {
  const opened = await openUserDatabase({ userId, host: memoryHost() });
  const nowMs = Date.parse("2026-03-01T12:00:00.000Z");
  return createSyncRuntime({ db: opened.db, api: new FakeServer(), deviceId: DEVICE_ID, userId, store: createSyncStore(), clock: { now: () => nowMs }, random: () => 0.5, newId: testId });
}

function profile(id: string, name: string): CachedProfile {
  return { user: { id, name } as UserDTO };
}

describe("shared device (PLT-12)", () => {
  afterEach(() => setSyncRuntime(undefined));

  test("two users on one phone keep separate databases and separate pending counts", async () => {
    const joana = await runtimeFor(JOANA);
    const carlos = await runtimeFor(CARLOS);
    const reportId = testId();

    setSyncRuntime(joana);
    await createComment({ id: testId(), entityType: "FIELD_REPORT", entityId: reportId, body: "Joana 1" });
    await createComment({ id: testId(), entityType: "FIELD_REPORT", entityId: reportId, body: "Joana 2" });
    setSyncRuntime(carlos);
    await createComment({ id: testId(), entityType: "FIELD_REPORT", entityId: reportId, body: "Carlos 1" });
    setSyncRuntime(undefined);

    const dbs: Record<string, SqlDb> = { [JOANA]: joana.db, [CARLOS]: carlos.db };
    const sources: DeviceUserSources = {
      listProfiles: async () => [profile(JOANA, "Joana Lima"), profile(CARLOS, "Carlos Souza"), profile(testId(), "Sem banco")],
      withUserDb: async (userId, read) => {
        const db = dbs[userId];
        return db === undefined ? undefined : read(db);
      },
    };

    expect(await countPendingWork(joana.db)).toBe(2);
    expect(await countPendingWork(carlos.db)).toBe(1);
    const joanaBodies = (await joana.db.all<{ body: string }>("SELECT body FROM comments ORDER BY body")).map((row) => row.body);
    expect(joanaBodies).toEqual(["Joana 1", "Joana 2"]);
    expect((await carlos.db.all<{ authorId: string }>("SELECT authorId FROM comments")).map((row) => row.authorId)).toEqual([CARLOS]);

    const users = await listDeviceUsers(sources);
    expect(users.map((user) => [user.name, user.pending])).toEqual([
      ["Carlos Souza", 1],
      ["Joana Lima", 2],
      ["Sem banco", null],
    ]);

    await render(<DeviceUsersCard sources={sources} />);
    const joanaRow = await screen.findByTestId(`device-user-${JOANA}`);
    expect(within(joanaRow).getByText("2 salvos no celular")).toBeTruthy();
    expect(within(screen.getByTestId(`device-user-${CARLOS}`)).getByText("1 salvo no celular")).toBeTruthy();
    expect(screen.getByText("Neste celular")).toBeTruthy();
  });

  test("renders nothing on a phone nobody has used yet", async () => {
    await render(<DeviceUsersCard sources={{ listProfiles: async () => [], withUserDb: async () => undefined }} />);
    expect(screen.queryByText("Neste celular")).toBeNull();
  });
});
