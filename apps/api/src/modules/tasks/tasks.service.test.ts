import { describe, expect, it } from "vitest";
import { isRestrictedToOwnTasks } from "@task-tracker/shared";
import { canManageTask, resolveAssignmentTargets } from "./tasks.service";
import type { AuthContext } from "../../plugins/auth";

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

function auth(overrides: Partial<AuthContext>): AuthContext {
  return {
    userId: "u1",
    membershipId: "m1",
    organizationId: "o1",
    isOwner: false,
    permissions: new Set<string>(),
    ...overrides,
  };
}

describe("task.own_only restriction", () => {
  it("marks holders restricted, but never the owner", () => {
    expect(
      isRestrictedToOwnTasks(auth({ permissions: new Set(["task.own_only"]) })),
    ).toBe(true);
    expect(
      isRestrictedToOwnTasks(
        auth({ isOwner: true, permissions: new Set(["task.own_only"]) }),
      ),
    ).toBe(false);
    expect(isRestrictedToOwnTasks(auth({}))).toBe(false);
  });

  it("blocks task management even for the creator or task.manage holders", () => {
    const restricted = auth({
      permissions: new Set(["task.own_only", "task.manage", "task.create"]),
    });
    expect(canManageTask(restricted, { createdByMembershipId: "m1" })).toBe(false);
    expect(canManageTask(restricted, { createdByMembershipId: "other" })).toBe(false);
  });

  it("leaves unrestricted holders untouched", () => {
    const manager = auth({ permissions: new Set(["task.manage"]) });
    expect(canManageTask(manager, { createdByMembershipId: "other" })).toBe(true);
    const creator = auth({});
    expect(canManageTask(creator, { createdByMembershipId: "m1" })).toBe(true);
    expect(canManageTask(creator, { createdByMembershipId: "other" })).toBe(false);
  });
});
