import { existsSync, readFileSync } from "node:fs";
import { rootPath, missingEnvKeys, readPackageJson } from "./env.ts";
import { dockerAvailable, mongoHealthy, redisHealthy } from "./docker.ts";
import { freeDiskGb, portFreeOrComposeOwned } from "./probes.ts";
import { run } from "./shell.ts";
import { error, ok, section, warn } from "./log.ts";

export interface CheckIssue {
  readonly label: string;
  readonly detail: string;
}

export interface CheckSummary {
  readonly failures: readonly CheckIssue[];
  readonly warnings: readonly CheckIssue[];
}

function pass(label: string, detail: string): void {
  ok(`${label}: ${detail}`);
}

function fail(failures: CheckIssue[], label: string, detail: string): void {
  failures.push({ label, detail });
  error(`${label}: ${detail}`);
}

function caution(warnings: CheckIssue[], label: string, detail: string): void {
  warnings.push({ label, detail });
  warn(`${label}: ${detail}`);
}

async function commandVersion(command: readonly string[], timeoutMs = 5_000): Promise<string | undefined> {
  const result = await run(command, { timeoutMs });
  if (result.code !== 0) {
    return undefined;
  }
  return (result.stdout || result.stderr).trim();
}

export async function runEnvironmentCheck(): Promise<CheckSummary> {
  const failures: CheckIssue[] = [];
  const warnings: CheckIssue[] = [];

  section("Required checks");
  const nodeVersion = process.versions.node;
  if (nodeVersion.startsWith("24.")) {
    pass("Node", nodeVersion);
  } else {
    fail(failures, "Node", `expected 24.x from .node-version, got ${nodeVersion}`);
  }

  const nodeVersionFile = rootPath(".node-version");
  if (existsSync(nodeVersionFile) && readFileSync(nodeVersionFile, "utf8").trim() === "24") {
    pass(".node-version", "24");
  } else {
    fail(failures, ".node-version", "missing or not 24");
  }

  const packageJson = readPackageJson();
  const packageManager = packageJson.packageManager ?? "";
  if (packageManager === "pnpm@11.0.9") {
    pass("packageManager", packageManager);
  } else {
    fail(failures, "packageManager", `expected pnpm@11.0.9, got ${packageManager || "missing"}`);
  }

  const pnpmVersion = await commandVersion(["pnpm", "--version"]);
  if (pnpmVersion?.startsWith("11.")) {
    pass("pnpm", pnpmVersion);
  } else {
    fail(failures, "pnpm", `expected 11.x, got ${pnpmVersion ?? "unavailable"}`);
  }

  const dockerError = await dockerAvailable();
  if (dockerError === undefined) {
    pass("Docker", "running");
  } else {
    fail(failures, "Docker", dockerError);
  }

  if (dockerError === undefined) {
    const mongoError = await mongoHealthy();
    if (mongoError === undefined) {
      pass("MongoDB", "rs.status().ok");
    } else {
      fail(failures, "MongoDB", mongoError);
    }

    const redisError = await redisHealthy();
    if (redisError === undefined) {
      pass("Redis", "PONG");
    } else {
      fail(failures, "Redis", redisError);
    }
  }

  for (const port of [3000, 4001, 4002, 4003, 27017, 6379]) {
    const result = await portFreeOrComposeOwned(port);
    if (result.ok) {
      pass(`Port ${port}`, result.detail);
    } else {
      fail(failures, `Port ${port}`, result.detail);
    }
  }

  const disk = freeDiskGb();
  if (disk >= 10) {
    pass("Disk", `${disk.toFixed(1)} GB free`);
  } else {
    fail(failures, "Disk", `expected >= 10 GB free, got ${disk.toFixed(1)} GB`);
  }

  const envMissing = missingEnvKeys();
  if (envMissing.length === 0) {
    pass(".env", "present with every .env.example key");
  } else if (!existsSync(rootPath(".env"))) {
    fail(failures, ".env", "missing; run pnpm dev:setup");
  } else {
    fail(failures, ".env", `missing keys: ${envMissing.join(", ")}; run pnpm dev:setup`);
  }

  section("Warnings");
  const java = await commandVersion(["java", "-version"]);
  if (java?.includes("17")) {
    pass("Java", "17 available");
  } else {
    caution(warnings, "Java", "Java 17 not detected");
  }

  if (process.env.ANDROID_HOME !== undefined && process.env.ANDROID_HOME.length > 0) {
    pass("ANDROID_HOME", process.env.ANDROID_HOME);
  } else {
    caution(warnings, "ANDROID_HOME", "not set");
  }

  if (process.platform === "darwin") {
    const xcode = await commandVersion(["xcode-select", "-p"]);
    if (xcode !== undefined && xcode.length > 0) {
      pass("Xcode", xcode);
    } else {
      caution(warnings, "Xcode", "xcode-select -p failed");
    }
    const pod = await commandVersion(["pod", "--version"]);
    if (pod !== undefined) {
      pass("CocoaPods", pod);
    } else {
      caution(warnings, "CocoaPods", "pod not found");
    }
  }

  const eas = await run(["npx", "eas", "whoami"], { timeoutMs: 10_000 });
  if (eas.code === 0) {
    pass("EAS CLI", (eas.stdout || eas.stderr).trim());
  } else {
    caution(warnings, "EAS CLI", "not logged in or not installed");
  }

  if (existsSync(rootPath("apps", "mobile", "android")) || existsSync(rootPath("apps", "mobile", "ios"))) {
    pass("Dev client", "native project present");
  } else {
    caution(warnings, "Dev client", "no apps/mobile/android or apps/mobile/ios project found");
  }

  return { failures, warnings };
}
