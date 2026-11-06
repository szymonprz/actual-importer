/**
 * What every command gets from the CLI shell, and how commands report
 * failure: throw `UserError` for expected problems (bad input, missing
 * config). cli.ts prints its message and exits with code 1. Anything else is
 * reported as an unexpected error (with a stack trace when DEBUG is set).
 */

import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";

export { UserError } from "../errors.js";

export interface CommandContext {
  /** Prompts are allowed (TTY, not --no-input, not --json). */
  interactive: boolean;
  /** Print one JSON document to stdout; everything else goes to stderr. */
  json: boolean;
}

export interface GlobalArgs {
  input?: boolean;
  json?: boolean;
}

export function createContext(argv: GlobalArgs): CommandContext {
  const json = Boolean(argv.json);
  const tty = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  return { json, interactive: tty && argv.input !== false && !json };
}

/** Progress / informational line: stdout normally, stderr in --json mode. */
export function info(ctx: CommandContext, message: string): void {
  (ctx.json ? process.stderr : process.stdout).write(message + "\n");
}

/** The command's result: JSON in --json mode, text otherwise. */
export function result(ctx: CommandContext, text: string, json: unknown): void {
  process.stdout.write((ctx.json ? JSON.stringify(json, null, 2) : text) + "\n");
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Declare a CLI command. The handler's argv type is inferred from the
 * builder, so options and their use can't drift apart. Register the result
 * in src/cli.ts.
 */
export function defineCommand<T>(spec: {
  command: string;
  describe: string;
  builder?: (yargs: Argv<GlobalArgs>) => Argv<T>;
  handler: (argv: ArgumentsCamelCase<T>) => void | Promise<void>;
}): CommandModule<GlobalArgs, T> {
  return spec;
}
