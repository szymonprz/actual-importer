import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveConnection,
  missingConnectionFields,
  upsertDotEnv,
  saveMappings,
  withMapping,
  withoutMapping,
  ENV,
} from "./config.js";

describe("resolveConnection", () => {
  const file = { serverUrl: "https://file", password: "filepw", budgetId: "file-id" };

  it("prefers env vars over the config file, per field", () => {
    const conn = resolveConnection(file, {
      [ENV.serverUrl]: "https://env",
      [ENV.e2ePassword]: "e2e",
    });
    expect(conn).toEqual({
      serverUrl: "https://env",
      password: "filepw",
      budgetId: "file-id",
      e2ePassword: "e2e",
    });
  });

  it("reports missing required fields by env var name", () => {
    expect(missingConnectionFields(resolveConnection({}, {}))).toEqual([
      ENV.serverUrl,
      ENV.password,
      ENV.budgetId,
    ]);
  });
});

describe("upsertDotEnv", () => {
  const conn = {
    serverUrl: "https://actual.example.com",
    password: "p#ss word",
    budgetId: "abc",
  };

  it("updates existing keys and keeps unrelated lines", () => {
    const out = upsertDotEnv(
      "# comment\nOTHER=1\nACTUAL_PASSWORD=old\nACTUAL_E2E_PASSWORD=stale\n",
      conn
    );
    expect(out).toBe(
      "# comment\nOTHER=1\nACTUAL_PASSWORD='p#ss word'\n" +
        "ACTUAL_SERVER_URL='https://actual.example.com'\nACTUAL_BUDGET_ID='abc'\n"
    );
  });

  it("picks a quote char the value doesn't contain, and round-trips through Node", () => {
    const tricky = { ...conn, password: `it's "q"` };
    const dir = mkdtempSync(join(tmpdir(), "ai-env-"));
    const path = join(dir, ".env");
    writeFileSync(path, upsertDotEnv("", tricky));
    const before = process.env[ENV.password];
    try {
      process.loadEnvFile(path);
      expect(process.env[ENV.password]).toBe(tricky.password);
    } finally {
      if (before === undefined) delete process.env[ENV.password];
      else process.env[ENV.password] = before;
      rmSync(dir, { recursive: true });
    }
  });
});

describe("saveMappings", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ai-cfg-"));
    vi.stubEnv(ENV.configPath, join(dir, "config.json"));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true });
  });

  it("never copies connection secrets into the JSON file", async () => {
    const fromEnv = {
      serverUrl: "https://env",
      password: "secret",
      budgetId: "id",
      accountMappings: [{ bankAccountNumber: "1", actualAccountId: "a" }],
      ignoredCounterparties: ["2"],
    };
    await saveMappings(fromEnv);
    const written = JSON.parse(readFileSync(join(dir, "config.json"), "utf-8"));
    expect(written).toEqual({
      accountMappings: fromEnv.accountMappings,
      ignoredCounterparties: ["2"],
    });
  });
});

describe("withMapping / withoutMapping", () => {
  const a = { bankAccountNumber: "10105014611000009704886994", actualAccountId: "x" };

  it("replaces an existing mapping for the same account, stored normalized", () => {
    const next = withMapping([a], {
      bankAccountNumber: "PL10 1050 1461 1000 0097 0488 6994",
      actualAccountId: "y",
    });
    expect(next).toEqual([{ bankAccountNumber: a.bankAccountNumber, actualAccountId: "y" }]);
  });

  it("removes regardless of formatting", () => {
    expect(withoutMapping([a], "10 1050 1461 1000 0097 0488 6994")).toEqual([]);
  });
});
