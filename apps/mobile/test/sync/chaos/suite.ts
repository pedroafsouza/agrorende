import { afterAll, afterEach, beforeAll } from "vitest";

import { ChaosDevice, type ChaosClock } from "./device";
import { SEED, startChaosServer, type ChaosServer } from "./harness";

export interface ChaosSuite {
  readonly server: () => ChaosServer;
  /** Fresh device (fresh directory), online, signed in as `userId`, after one first sync. */
  readonly device: (name: string, userId?: string, options?: { readonly clock?: ChaosClock; readonly deviceId?: string }) => Promise<ChaosDevice>;
  /** A device that is not signed in yet (for multi-device and clock cases). */
  readonly bare: (name: string, options?: { readonly clock?: ChaosClock; readonly deviceId?: string }) => ChaosDevice;
}

/** Registers the shared server lifecycle for one chaos test file and tracks its devices. */
export function useChaosSuite(): ChaosSuite {
  let server: ChaosServer | undefined;
  const devices: ChaosDevice[] = [];

  beforeAll(async () => {
    server = await startChaosServer();
  });

  afterEach(async () => {
    server?.resetFaults();
    for (const device of devices.splice(0)) await device.destroy();
  });

  afterAll(async () => {
    await server?.close();
  });

  const current = (): ChaosServer => {
    if (server === undefined) throw new Error("chaos server not started");
    return server;
  };

  const bare: ChaosSuite["bare"] = (name, options = {}) => {
    const device = new ChaosDevice(current(), `${name}-${devices.length}`, options);
    devices.push(device);
    return device;
  };

  return {
    server: current,
    bare,
    async device(name, userId = SEED.field, options = {}) {
      current().resetFaults();
      const device = bare(name, options);
      await device.login(userId);
      await device.sync();
      return device;
    },
  };
}
