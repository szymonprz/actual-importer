import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export interface AccountMapping {
  bankAccountNumber: string;
  actualAccountId: string;
  bank?: string;
}

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
} as const;

const DEFAULT_CONFIG_PATH = join(homedir(), ".actual-importer", "config.json");

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
    throw new Error(
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

/**
 * Insert or update connection keys in a .env file, keeping any other lines.
 * Values are quoted so passwords with spaces or `#` survive.
 */
export function upsertDotEnv(existing: string, conn: ConnectionConfig): string {
  const values: Record<string, string | undefined> = {
    [ENV.serverUrl]: conn.serverUrl,
    [ENV.password]: conn.password,
    [ENV.budgetId]: conn.budgetId,
    [ENV.e2ePassword]: conn.e2ePassword,
  };
  // Node's .env parser has no escape sequences, so pick a quote char the value
  // doesn't contain. Single quotes are literal (no \n expansion).
  const quote = (v: string) => {
    const q = ["'", '"', "`"].find((c) => !v.includes(c));
    if (!q || v.includes("\n")) {
      throw new Error("Value can't be written to .env safely; use the JSON config instead.");
    }
    return `${q}${v}${q}`;
  };
  const seen = new Set<string>();
  const lines = existing
    .split("\n")
    .filter((line, i, all) => !(i === all.length - 1 && line === ""))
    .flatMap((line) => {
      const key = line.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1];
      if (!key || !(key in values)) return [line];
      seen.add(key);
      const v = values[key];
      return v ? [`${key}=${quote(v)}`] : [];
    });
  for (const [key, v] of Object.entries(values)) {
    if (!seen.has(key) && v) lines.push(`${key}=${quote(v)}`);
  }
  return lines.join("\n") + "\n";
}
