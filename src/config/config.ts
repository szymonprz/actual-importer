import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { UserError } from "../errors.js";

import type { AccountMapping } from "./mappings.js";

export type { AccountMapping };

export interface ConnectionConfig {
  serverUrl: string;
  password: string;
  budgetId: string;
  e2ePassword?: string;
}

export interface Config extends ConnectionConfig {
  accountMappings: AccountMapping[];
  /** Counterparty account numbers the user said are not their own. */
  ignoredCounterparties?: string[];
}

/** Shape of the JSON file — every field optional since env vars may cover them. */
type ConfigFile = Partial<Config>;

export const ENV = {
  serverUrl: "ACTUAL_SERVER_URL",
  password: "ACTUAL_PASSWORD",
  budgetId: "ACTUAL_BUDGET_ID",
  e2ePassword: "ACTUAL_E2E_PASSWORD",
  configPath: "ACTUAL_IMPORTER_CONFIG",
  dataDir: "ACTUAL_IMPORTER_DATA_DIR",
} as const;

const HOME_DIR = join(homedir(), ".actual-importer");
const DEFAULT_CONFIG_PATH = join(HOME_DIR, "config.json");

/**
 * Where @actual-app/api caches the downloaded budget. It holds a full,
 * decrypted copy of the budget, so it lives in the user's home directory
 * (created 0700), not a shared temp dir.
 */
export function getDataDir(env: NodeJS.ProcessEnv = process.env): string {
  loadDotEnv();
  const override = env[ENV.dataDir];
  return override ? resolve(override) : join(HOME_DIR, "cache");
}

let envLoaded = false;

/** Load `.env` from the current directory once. Real env vars take precedence. */
export function loadDotEnv(cwd = process.cwd()): void {
  if (envLoaded) return;
  envLoaded = true;
  const path = join(cwd, ".env");
  if (existsSync(path)) process.loadEnvFile(path);
}

export function getConfigPath(): string {
  loadDotEnv();
  const override = process.env[ENV.configPath];
  return override ? resolve(override) : DEFAULT_CONFIG_PATH;
}

export async function readConfigFile(): Promise<ConfigFile> {
  const path = getConfigPath();
  if (!existsSync(path)) return {};
  return JSON.parse(await readFile(path, "utf-8")) as ConfigFile;
}

async function writeConfigFile(config: ConfigFile): Promise<void> {
  const path = getConfigPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(config, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });
}

/** Connection settings from env vars, falling back to the config file per field. */
export function resolveConnection(
  file: ConfigFile,
  env: NodeJS.ProcessEnv = process.env
): Partial<ConnectionConfig> {
  return {
    serverUrl: env[ENV.serverUrl] || file.serverUrl,
    password: env[ENV.password] || file.password,
    budgetId: env[ENV.budgetId] || file.budgetId,
    e2ePassword: env[ENV.e2ePassword] || file.e2ePassword,
  };
}

export function missingConnectionFields(
  conn: Partial<ConnectionConfig>
): string[] {
  return (["serverUrl", "password", "budgetId"] as const)
    .filter((k) => !conn[k])
    .map((k) => ENV[k]);
}

/** True when every required connection field comes from the environment. */
export function connectionFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  loadDotEnv();
  return Boolean(env[ENV.serverUrl] && env[ENV.password] && env[ENV.budgetId]);
}

export async function loadConfig(): Promise<Config> {
  loadDotEnv();
  const file = await readConfigFile();
  const conn = resolveConnection(file);
  const missing = missingConnectionFields(conn);
  if (missing.length > 0) {
    throw new UserError(
      `Missing connection settings: ${missing.join(", ")}.\n` +
        "Set them in .env (see .env.example) or run `actual-importer setup`."
    );
  }
  return {
    ...(conn as ConnectionConfig),
    accountMappings: file.accountMappings ?? [],
    ignoredCounterparties: file.ignoredCounterparties ?? [],
  };
}

/** Save connection settings to the config file, keeping existing mappings. */
export async function saveConnection(conn: ConnectionConfig): Promise<void> {
  const file = await readConfigFile();
  await writeConfigFile({ ...file, ...conn });
}

/**
 * Save account mappings / ignored counterparties to the config file without
 * touching connection fields — secrets that come from .env never get copied
 * into the JSON file.
 */
export async function saveMappings(
  update: Pick<Config, "accountMappings" | "ignoredCounterparties">
): Promise<void> {
  const file = await readConfigFile();
  await writeConfigFile({
    ...file,
    accountMappings: update.accountMappings,
    ignoredCounterparties: update.ignoredCounterparties,
  });
}
