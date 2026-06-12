import * as rrulePkg from "rrule";
import type { RRule as RRuleInstance } from "rrule";

// rrule ships a UMD main without an `exports` map, so under real Node ESM
// the named exports aren't statically detectable (they sit on `default`),
// while bundler-style resolution (vitest, vite) sees them directly.
const { RRule } = ((rrulePkg as { default?: typeof rrulePkg }).default ??
  rrulePkg) as typeof rrulePkg;

// rrule is timezone-naive: it does calendar math on Date objects whose UTC
// fields are treated as plain wall-clock values. So we convert real instants
// to "wall clock in the rule's timezone, disguised as UTC" before handing
// them to rrule, and convert results back to real UTC instants afterwards.

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function getDtf(timeZone: string): Intl.DateTimeFormat {
  let dtf = dtfCache.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(timeZone, dtf);
  }
  return dtf;
}

function wallTimeInZone(date: Date, timeZone: string): Date {
  const parts = getDtf(timeZone).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  return new Date(
    Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    ),
  );
}

function offsetAt(date: Date, timeZone: string): number {
  return wallTimeInZone(date, timeZone).getTime() - date.getTime();
}

function zonedWallTimeToUtc(wall: Date, timeZone: string): Date {
  // Treat the wall time as UTC, then correct by the zone offset at that
  // instant; the second pass settles DST-boundary cases.
  const first = new Date(wall.getTime() - offsetAt(wall, timeZone));
  return new Date(wall.getTime() - offsetAt(first, timeZone));
}

/**
 * Parses an RRULE body (no DTSTART line) anchored at `dtstart` interpreted
 * in `timezone`. Throws on an invalid rule string.
 */
export function parseRule(
  rruleString: string,
  timezone: string,
  dtstart: Date,
): RRuleInstance {
  const options = RRule.parseString(rruleString);
  const anchor = wallTimeInZone(dtstart, timezone);
  anchor.setUTCSeconds(0, 0);
  options.dtstart = anchor;
  return new RRule(options);
}

/**
 * The next occurrence strictly after `after`, as a real UTC instant, or
 * null when the rule is exhausted (COUNT/UNTIL reached).
 */
export function nextOccurrence(
  rruleString: string,
  timezone: string,
  after: Date,
  dtstart: Date,
): Date | null {
  const rule = parseRule(rruleString, timezone, dtstart);
  const next = rule.after(wallTimeInZone(after, timezone), false);
  return next ? zonedWallTimeToUtc(next, timezone) : null;
}

/**
 * Concrete reminder times for a task: dueAt minus each offset, future-only,
 * deduplicated, soonest first.
 */
export function reminderTimes(
  dueAt: Date,
  offsetsMinutes: number[],
  now: Date,
): { offsetMinutes: number; at: Date }[] {
  return [...new Set(offsetsMinutes)]
    .map((offsetMinutes) => ({
      offsetMinutes,
      at: new Date(dueAt.getTime() - offsetMinutes * 60_000),
    }))
    .filter((r) => r.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}
