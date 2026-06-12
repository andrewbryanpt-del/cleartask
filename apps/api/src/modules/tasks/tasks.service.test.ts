import { describe, expect, it } from "vitest";
import { resolveAssignmentTargets } from "./tasks.service";

describe("resolveAssignmentTargets", () => {
  it("fans a department out to one target per member", () => {
    const targets = resolveAssignmentTargets(
      [],
      [{ departmentId: "dept-1", membershipIds: ["m1", "m2", "m3"] }],
    );
    expect(targets).toEqual([
      { membershipId: "m1", sourceDepartmentId: "dept-1" },
      { membershipId: "m2", sourceDepartmentId: "dept-1" },
      { membershipId: "m3", sourceDepartmentId: "dept-1" },
    ]);
  });

  it("deduplicates members appearing in several departments", () => {
    const targets = resolveAssignmentTargets(
      [],
      [
        { departmentId: "dept-1", membershipIds: ["m1", "m2"] },
        { departmentId: "dept-2", membershipIds: ["m2", "m3"] },
      ],
    );
    expect(targets).toHaveLength(3);
    expect(targets.find((t) => t.membershipId === "m2")).toEqual({
      membershipId: "m2",
      sourceDepartmentId: "dept-1",
    });
  });

  it("records a direct assignment even when the member is also in an assigned department", () => {
    const targets = resolveAssignmentTargets(
      ["m1"],
      [{ departmentId: "dept-1", membershipIds: ["m1", "m2"] }],
    );
    expect(targets).toContainEqual({
      membershipId: "m1",
      sourceDepartmentId: null,
    });
    expect(targets).toContainEqual({
      membershipId: "m2",
      sourceDepartmentId: "dept-1",
    });
  });

  it("deduplicates repeated direct assignments", () => {
    const targets = resolveAssignmentTargets(["m1", "m1"], []);
    expect(targets).toEqual([{ membershipId: "m1", sourceDepartmentId: null }]);
  });

  it("returns nothing when no assignees are given", () => {
    expect(resolveAssignmentTargets([], [])).toEqual([]);
  });
});
