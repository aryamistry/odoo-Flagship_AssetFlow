import { describe, expect, it } from "vitest";
import { reportingWindow, toCsv } from "./report.service.js";

describe("report utilities", () => {
  it("uses an explicit valid reporting window", () => {
    const value = reportingWindow("2026-01-01T00:00:00.000Z", "2026-04-01T00:00:00.000Z");
    expect(value.start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
  it("escapes CSV values", () => expect(toCsv([{ name: 'Room "B2"', count: 2 }])).toContain('"Room ""B2"""'));
});

