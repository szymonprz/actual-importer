import { describe, it, expect } from "vitest";
import { computeImportedId } from "../../services/deduplication.js";

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
