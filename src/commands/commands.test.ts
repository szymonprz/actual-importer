import { describe, it, expect, afterEach } from "vitest";
import { resolveAccount } from "./map.js";
import { createContext, UserError } from "./runtime.js";

describe("resolveAccount", () => {
  const accounts = [
    { id: "a1", name: "ING Main" },
    { id: "a2", name: "Erste" },
  ];

  it("finds by id or case-insensitive name", () => {
    expect(resolveAccount(accounts, "a2").name).toBe("Erste");
    expect(resolveAccount(accounts, "ing main").id).toBe("a1");
  });

  it("lists the available accounts when nothing matches", () => {
    expect(() => resolveAccount(accounts, "Savings")).toThrow(UserError);
    expect(() => resolveAccount(accounts, "Savings")).toThrow(/ING Main, Erste/);
  });
});

describe("createContext", () => {
  const tty = { stdin: process.stdin.isTTY, stdout: process.stdout.isTTY };
  afterEach(() => {
    process.stdin.isTTY = tty.stdin;
    process.stdout.isTTY = tty.stdout;
  });

  it("is interactive only on a TTY without --no-input or --json", () => {
    process.stdin.isTTY = true;
    process.stdout.isTTY = true;
    expect(createContext({}).interactive).toBe(true);
    expect(createContext({ input: false }).interactive).toBe(false);
    expect(createContext({ json: true })).toEqual({ json: true, interactive: false });

    process.stdout.isTTY = false;
    expect(createContext({}).interactive).toBe(false);
  });
});
