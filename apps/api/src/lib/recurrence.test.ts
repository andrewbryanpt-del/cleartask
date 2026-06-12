import { describe, expect, it } from "vitest";
import { nextOccurrence, parseRule, reminderTimes } from "./recurrence";

const dtstart = new Date("2026-06-01T00:00:00Z");

describe("nextOccurrence", () => {
  it("computes the next daily occurrence in UTC", () => {
    const next = nextOccurrence(
      "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
      "UTC",
      new Date("2026-06-12T10:00:00Z"),
      dtstart,
    );
    expect(next?.toISOString()).toBe("2026-06-13T09:00:00.000Z");
  });

  it("is strictly after the given instant", () => {
    const next = nextOccurrence(
      "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
      "UTC",
      new Date("2026-06-12T09:00:00Z"),
      dtstart,
    );
    expect(next?.toISOString()).toBe("2026-06-13T09:00:00.000Z");
  });

  it("interprets clock times in the rule's timezone (EDT in June = UTC-4)", () => {
    const next = nextOccurrence(
      "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
      "America/New_York",
      new Date("2026-06-12T00:00:00Z"),
      dtstart,
    );
    expect(next?.toISOString()).toBe("2026-06-12T13:00:00.000Z");
  });

  it("handles weekly BYDAY rules", () => {
    // 2026-06-12 is a Friday; next Monday is the 15th.
    const next = nextOccurrence(
      "FREQ=WEEKLY;BYDAY=MO;BYHOUR=8;BYMINUTE=30",
      "UTC",
      new Date("2026-06-12T00:00:00Z"),
      dtstart,
    );
    expect(next?.toISOString()).toBe("2026-06-15T08:30:00.000Z");
  });

  it("returns null when the rule is exhausted", () => {
    const next = nextOccurrence(
      "FREQ=DAILY;COUNT=1;BYHOUR=9;BYMINUTE=0",
      "UTC",
      new Date("2026-06-12T00:00:00Z"),
      dtstart,
    );
    expect(next).toBeNull();
  });

  it("rejects invalid rule strings", () => {
    expect(() =>
      parseRule("FREQ=SOMETIMES", "UTC", dtstart),
    ).toThrow();
  });
});

describe("reminderTimes", () => {
  const dueAt = new Date("2026-06-20T09:00:00Z");
  const now = new Date("2026-06-12T00:00:00Z");

  it("maps offsets to concrete times, soonest first", () => {
    const times = reminderTimes(dueAt, [1440, 10080, 0], now);
    expect(times.map((t) => t.at.toISOString())).toEqual([
      "2026-06-13T09:00:00.000Z",
      "2026-06-19T09:00:00.000Z",
      "2026-06-20T09:00:00.000Z",
    ]);
    expect(times[0]!.offsetMinutes).toBe(10080);
  });

  it("drops reminders that are already in the past", () => {
    const times = reminderTimes(dueAt, [20160], now); // 14 days before = past
    expect(times).toEqual([]);
  });

  it("deduplicates repeated offsets", () => {
    const times = reminderTimes(dueAt, [1440, 1440], now);
    expect(times).toHaveLength(1);
  });
});
