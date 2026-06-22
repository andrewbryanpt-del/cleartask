export const REPEAT_PRESETS = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "custom",
] as const;
export type RepeatPreset = (typeof REPEAT_PRESETS)[number];

export const CUSTOM_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export type CustomFrequency = (typeof CUSTOM_FREQUENCIES)[number];

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

function dueParts(dueAtLocal: string) {
  const d = new Date(dueAtLocal);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid due date");
  }
  return {
    hour: d.getHours(),
    minute: d.getMinutes(),
    monthDay: d.getDate(),
    month: d.getMonth() + 1,
    weekday: WEEKDAY_CODES[d.getDay()]!,
  };
}

function timeClause(hour: number, minute: number): string {
  return `BYHOUR=${hour};BYMINUTE=${minute}`;
}

/** Build an RRULE body (no DTSTART) from a datetime-local due value. */
export function buildRruleFromDueAt(
  dueAtLocal: string,
  preset: Exclude<RepeatPreset, "none">,
  custom?: { interval: number; freq: CustomFrequency },
): string {
  const { hour, minute, monthDay, month, weekday } = dueParts(dueAtLocal);
  const time = timeClause(hour, minute);

  if (preset === "custom" && custom) {
    const interval = Math.max(1, Math.floor(custom.interval));
    const intervalClause = interval > 1 ? `INTERVAL=${interval};` : "";
    if (custom.freq === "DAILY") {
      return `FREQ=DAILY;${intervalClause}${time}`;
    }
    if (custom.freq === "WEEKLY") {
      return `FREQ=WEEKLY;${intervalClause}BYDAY=${weekday};${time}`;
    }
    if (custom.freq === "MONTHLY") {
      return `FREQ=MONTHLY;${intervalClause}BYMONTHDAY=${monthDay};${time}`;
    }
    return `FREQ=YEARLY;${intervalClause}BYMONTH=${month};BYMONTHDAY=${monthDay};${time}`;
  }

  if (preset === "daily") return `FREQ=DAILY;${time}`;
  if (preset === "weekly") return `FREQ=WEEKLY;BYDAY=${weekday};${time}`;
  if (preset === "monthly") return `FREQ=MONTHLY;BYMONTHDAY=${monthDay};${time}`;
  return `FREQ=YEARLY;BYMONTH=${month};BYMONTHDAY=${monthDay};${time}`;
}
