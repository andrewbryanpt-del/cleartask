import { describe, expect, it } from "vitest";
import {
  groupFacts,
  isOverdue,
  summarize,
  type AssignmentFact,
} from "./reports.service";

const now = new Date("2026-06-12T12:00:00Z");

function fact(overrides: Partial<AssignmentFact>): AssignmentFact {
  return {
    status: "NOT_STARTED",
    completedAt: null,
    dueAt: null,
    taskId: "t1",
    taskTitle: "Task",
    membershipId: "m1",
    memberName: "Alice",
    departmentId: null,
    departmentName: null,
    locationId: null,
    locationName: null,
    ...overrides,
  };
}

describe("isOverdue", () => {
  it("is overdue when past due and not completed", () => {
    expect(
      isOverdue(fact({ dueAt: new Date("2026-06-11T00:00:00Z") }), now),
    ).toBe(true);
  });

  it("is not overdue when completed or without a due date", () => {
    expect(
      isOverdue(
        fact({ status: "COMPLETED", dueAt: new Date("2026-06-11T00:00:00Z") }),
        now,
      ),
    ).toBe(false);
    expect(isOverdue(fact({}), now)).toBe(false);
  });
});

describe("summarize", () => {
  it("counts statuses, overdue, and late completions", () => {
    const summary = summarize(
      [
        fact({ status: "COMPLETED", dueAt: new Date("2026-06-10T00:00:00Z"), completedAt: new Date("2026-06-11T00:00:00Z") }),
        fact({ status: "COMPLETED", dueAt: new Date("2026-06-10T00:00:00Z"), completedAt: new Date("2026-06-09T00:00:00Z") }),
        fact({ status: "IN_PROGRESS", dueAt: new Date("2026-06-11T00:00:00Z") }),
        fact({ status: "NOT_STARTED" }),
      ],
      now,
    );
    expect(summary).toEqual({
      total: 4,
      completed: 2,
      inProgress: 1,
      notStarted: 1,
      overdue: 1,
      completedLate: 1,
      completionRate: 0.5,
    });
  });

  it("has a null completion rate when empty", () => {
    expect(summarize([], now).completionRate).toBeNull();
  });
});

describe("groupFacts", () => {
  const facts = [
    fact({ departmentId: "d1", departmentName: "Kitchen", status: "COMPLETED", completedAt: now }),
    fact({ departmentId: "d1", departmentName: "Kitchen" }),
    fact({ departmentId: "d2", departmentName: "Front desk" }),
    fact({}),
  ];

  it("groups by department with a fallback bucket", () => {
    const groups = groupFacts(facts, "department", now);
    expect(groups.map((g) => g.label)).toEqual([
      "Front desk",
      "Kitchen",
      "No department",
    ]);
    const kitchen = groups.find((g) => g.label === "Kitchen")!;
    expect(kitchen.total).toBe(2);
    expect(kitchen.completed).toBe(1);
    expect(kitchen.completionRate).toBe(0.5);
  });

  it("groups by member", () => {
    const groups = groupFacts(
      [
        fact({ membershipId: "m1", memberName: "Alice" }),
        fact({ membershipId: "m2", memberName: "Bob" }),
        fact({ membershipId: "m2", memberName: "Bob" }),
      ],
      "member",
      now,
    );
    expect(groups.find((g) => g.label === "Bob")!.total).toBe(2);
  });
});
