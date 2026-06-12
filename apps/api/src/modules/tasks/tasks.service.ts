import type { Prisma } from "@prisma/client";
import { hasPermission } from "@task-tracker/shared";
import { prisma } from "../../lib/prisma";
import { badRequest, notFound } from "../../lib/errors";
import type { AuthContext } from "../../plugins/auth";

export interface AssignmentTarget {
  membershipId: string;
  sourceDepartmentId: string | null;
}

// Pure fan-out resolution: department assignment becomes one target per
// member, deduplicated across departments (first department wins as the
// recorded source). A direct assignment always wins over a department one.
export function resolveAssignmentTargets(
  directMembershipIds: string[],
  departmentMembers: { departmentId: string; membershipIds: string[] }[],
): AssignmentTarget[] {
  const targets = new Map<string, string | null>();
  for (const { departmentId, membershipIds } of departmentMembers) {
    for (const membershipId of membershipIds) {
      if (!targets.has(membershipId)) targets.set(membershipId, departmentId);
    }
  }
  for (const membershipId of directMembershipIds) {
    targets.set(membershipId, null);
  }
  return [...targets].map(([membershipId, sourceDepartmentId]) => ({
    membershipId,
    sourceDepartmentId,
  }));
}

// Validates the requested assignees belong to the organization and expands
// departments into their members.
export async function expandAssignees(
  organizationId: string,
  membershipIds: string[],
  departmentIds: string[],
): Promise<AssignmentTarget[]> {
  if (membershipIds.length > 0) {
    const count = await prisma.membership.count({
      where: { id: { in: membershipIds }, organizationId },
    });
    if (count !== new Set(membershipIds).size) {
      throw badRequest("Unknown assignee");
    }
  }

  let departmentMembers: { departmentId: string; membershipIds: string[] }[] =
    [];
  if (departmentIds.length > 0) {
    const departments = await prisma.department.findMany({
      where: { id: { in: departmentIds }, organizationId },
      include: { memberships: { select: { id: true } } },
    });
    if (departments.length !== new Set(departmentIds).size) {
      throw badRequest("Unknown department");
    }
    departmentMembers = departments.map((d) => ({
      departmentId: d.id,
      membershipIds: d.memberships.map((m) => m.id),
    }));
  }

  return resolveAssignmentTargets(membershipIds, departmentMembers);
}

export function canManageTask(
  auth: AuthContext,
  task: { createdByMembershipId: string | null },
): boolean {
  return (
    hasPermission(auth, "task.manage") ||
    task.createdByMembershipId === auth.membershipId
  );
}

export const taskDetailInclude = {
  location: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  template: { select: { id: true, title: true } },
  assignments: {
    include: {
      membership: {
        select: {
          id: true,
          user: { select: { id: true, name: true, avatarKey: true } },
        },
      },
      proofs: true,
    },
    orderBy: { createdAt: "asc" },
  },
  comments: {
    include: {
      membership: {
        select: {
          id: true,
          user: { select: { id: true, name: true, avatarKey: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  },
  attachments: {
    include: { views: { select: { membershipId: true, viewedAt: true } } },
  },
} satisfies Prisma.TaskInclude;

export type TaskDetail = Prisma.TaskGetPayload<{
  include: typeof taskDetailInclude;
}>;

// Fetches a task scoped to the caller's organization and enforces
// visibility: managers see every task, everyone else only tasks they
// created or are assigned to. Hidden tasks 404 rather than 403 so their
// existence isn't leaked.
export async function getVisibleTask(
  auth: AuthContext,
  taskId: string,
): Promise<TaskDetail> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, organizationId: auth.organizationId },
    include: taskDetailInclude,
  });
  if (!task) throw notFound("Task not found");

  const visible =
    canManageTask(auth, task) ||
    task.assignments.some((a) => a.membershipId === auth.membershipId);
  if (!visible) throw notFound("Task not found");
  return task;
}
