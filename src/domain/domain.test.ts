import { describe, it, expect } from "vitest";
import {
  formatAccountNumber,
  isNrb,
  normalizeAccountNumber,
  sameAccount,
} from "./account-number.js";
import { parseDecimalAmount, toCents } from "./money.js";
import { daysBetween, isIsoDate, shiftDate } from "./dates.js";

const NRB = "10105014611000009704886994";

describe("account numbers", () => {
  it("normalizes spaces, apostrophes and the PL prefix", () => {
    expect(normalizeAccountNumber("PL10 1050 1461")).toBe("1010501461");
    expect(normalizeAccountNumber("'10 1050 1461'")).toBe("1010501461");
    expect(sameAccount(`PL${formatAccountNumber(NRB)}`, NRB)).toBe(true);
  });

  it("recognizes NRBs", () => {
    expect(isNrb(NRB)).toBe(true);
    expect(isNrb(`PL ${formatAccountNumber(NRB)}`)).toBe(true);
    expect(isNrb("1915031/19730")).toBe(false);
  });

  it("formats NRBs in groups and leaves other values alone", () => {
    expect(formatAccountNumber(NRB)).toBe("10 1050 1461 1000 0097 0488 6994");
    expect(formatAccountNumber("1915031/19730")).toBe("1915031/19730");
  });
});

describe("money", () => {
  it("converts to integer cents without float drift", () => {
    expect(toCents(12.3)).toBe(1230);
    expect(toCents(-0.29)).toBe(-29);
    expect(toCents(1.15)).toBe(115); // 1.15 * 100 = 114.99999999999999
  });

  it("parses Polish decimal amounts", () => {
    expect(parseDecimalAmount("-60,00")).toBe(-60);
    expect(parseDecimalAmount("-439,03")).toBe(-439.03);
    expect(parseDecimalAmount("+1 234,56")).toBe(1234.56);
    expect(parseDecimalAmount("7000")).toBe(7000);
    expect(parseDecimalAmount("12.5")).toBe(12.5);
  });

  it("rejects values that aren't amounts", () => {
    expect(() => parseDecimalAmount("")).toThrow(/invalid amount/);
    expect(() => parseDecimalAmount("abc")).toThrow(/invalid amount/);
    expect(() => parseDecimalAmount("1,2,3")).toThrow(/invalid amount/);
  });
});

describe("dates", () => {
  it("validates ISO dates", () => {
    expect(isIsoDate("2026-11-06")).toBe(true);
    expect(isIsoDate("06-11-2026")).toBe(false);
    expect(isIsoDate("2026-13-45")).toBe(false);
  });

  it("shifts across month and year boundaries", () => {
    expect(shiftDate("2026-06-01", -3)).toBe("2026-05-29");
    expect(shiftDate("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("measures whole days in either direction", () => {
    expect(daysBetween("2026-06-01", "2026-06-04")).toBe(3);
    expect(daysBetween("2026-06-04", "2026-06-01")).toBe(3);
  });
});
