import { describe, it, expect } from "vitest";
import { computeImportedId, computeImportedIds } from "../../services/deduplication.js";

describe("computeImportedId", () => {
  it("should return a deterministic SHA-256 hash", () => {
    const id1 = computeImportedId("2026-04-01", -45.5, "Zakupy", "12345");
    const id2 = computeImportedId("2026-04-01", -45.5, "Zakupy", "12345");
    expect(id1).toBe(id2);
    expect(id1).toHaveLength(64); // SHA-256 hex
  });

  it("should produce different hashes for different inputs", () => {
    const id1 = computeImportedId("2026-04-01", -45.5, "Zakupy", "12345");
    const id2 = computeImportedId("2026-04-02", -45.5, "Zakupy", "12345");
    const id3 = computeImportedId("2026-04-01", -50, "Zakupy", "12345");
    const id4 = computeImportedId("2026-04-01", -45.5, "Inne", "12345");
    const id5 = computeImportedId("2026-04-01", -45.5, "Zakupy", "99999");

    expect(new Set([id1, id2, id3, id4, id5]).size).toBe(5);
  });
});

describe("computeImportedIds", () => {
  const atm = { date: "2026-03-04", amount: -1000, description: "Wypłata gotówki" };
  const other = { date: "2026-03-04", amount: -50, description: "Sklep" };

  it("keeps the original ID for the first occurrence", () => {
    const [first] = computeImportedIds([atm], "123");
    expect(first).toBe(computeImportedId(atm.date, atm.amount, atm.description, "123"));
  });

  it("gives identical same-day transactions distinct IDs", () => {
    const ids = computeImportedIds([atm, other, atm, atm], "123");
    expect(new Set(ids).size).toBe(4);
    expect(ids[0]).toBe(computeImportedId(atm.date, atm.amount, atm.description, "123"));
    expect(ids[2]).toBe(computeImportedId(atm.date, atm.amount, atm.description, "123", 2));
    expect(ids[3]).toBe(computeImportedId(atm.date, atm.amount, atm.description, "123", 3));
  });

  it("is stable across re-imports of the same statement", () => {
    expect(computeImportedIds([atm, atm], "123")).toEqual(computeImportedIds([atm, atm], "123"));
  });
});
