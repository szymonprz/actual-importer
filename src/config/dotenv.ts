import { ENV, type ConnectionConfig } from "./config.js";

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
