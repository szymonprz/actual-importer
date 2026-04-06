import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface AccountMapping {
  bankAccountNumber: string;
  actualAccountId: string;
  bank: string;
}

export interface Config {
  serverUrl: string;
  password: string;
  budgetId: string;
  e2ePassword?: string;
  accountMappings: AccountMapping[];
}

const CONFIG_DIR = join(homedir(), ".actual-importer");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function configExists(): boolean {
  return existsSync(CONFIG_PATH);
}

export async function loadConfig(): Promise<Config> {
  if (!configExists()) {
    throw new Error(
      "Configuration not found. Run `actual-importer setup` first."
    );
  }
  const raw = await readFile(CONFIG_PATH, "utf-8");
  return JSON.parse(raw) as Config;
}

export async function saveConfig(config: Config): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}
