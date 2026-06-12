import type { ReportGroupBy } from "@task-tracker/shared";
import { prisma } from "../../lib/prisma";

// One denormalized row per task assignment — the single shape that
// dashboards, JSON reports, and the XLSX/PDF exporters all aggregate over.
export interface AssignmentFact {
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  completedAt: Date | null;
  dueAt: Date | null;
  taskId: string;
  taskTitle: string;
  membershipId: string;
  memberName: string;
  departmentId: string | null;
  departmentName: string | null;
  locationId: string | null;
  locationName: string | null;
}

export interface CompletionSummary {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  overdue: number;
  completedLate: number;
  completionRate: number | null; // null when there is nothing to complete
}

const FACT_CAP = 20_000;

export async function fetchAssignmentFacts(
  organizationId: string,
  filters: {
    from?: Date;
    to?: Date;
    locationId?: string;
    departmentId?: string;
    departmentIds?: string[];
    membershipId?: string;
  } = {},
): Promise<AssignmentFact[]> {
  const { from, to } = filters;
  // The range applies to when the work was due; tasks without a due date
  // fall back to their creation time.
  const range =
    from || to
      ? {
          OR: [
            { dueAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } },
            {
              dueAt: null,
              createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            },
          ],
        }
      : {};

  const assignments = await prisma.taskAssignment.findMany({
    where: {
      ...(filters.membershipId ? { membershipId: filters.membershipId } : {}),
      task: {
        organizationId,
        ...(filters.locationId ? { locationId: filters.locationId } : {}),
        ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
        ...(filters.departmentIds
          ? { departmentId: { in: filters.departmentIds } }
          : {}),
        ...range,
      },
    },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          dueAt: true,
          departmentId: true,
          locationId: true,
          department: { select: { name: true } },
          location: { select: { name: true } },
        },
      },
      membership: {
        select: { id: true, user: { select: { name: true } } },
      },
    },
    take: FACT_CAP,
  });

  return assignments.map((a) => ({
    status: a.status,
    completedAt: a.completedAt,
    dueAt: a.task.dueAt,
    taskId: a.task.id,
    taskTitle: a.task.title,
    membershipId: a.membership.id,
    memberName: a.membership.user.name,
    departmentId: a.task.departmentId,
    departmentName: a.task.department?.name ?? null,
    locationId: a.task.locationId,
    locationName: a.task.location?.name ?? null,
  }));
}

export function isOverdue(fact: AssignmentFact, now: Date): boolean {
  return (
    fact.status !== "COMPLETED" &&
    fact.dueAt !== null &&
    fact.dueAt.getTime() < now.getTime()
  );
}

export function summarize(
  facts: AssignmentFact[],
  now: Date,
): CompletionSummary {
  let completed = 0;
  let inProgress = 0;
  let notStarted = 0;
  let overdue = 0;
  let completedLate = 0;
  for (const fact of facts) {
    if (fact.status === "COMPLETED") {
      completed += 1;
      if (
        fact.dueAt &&
        fact.completedAt &&
        fact.completedAt.getTime() > fact.dueAt.getTime()
      ) {
        completedLate += 1;
      }
    } else if (fact.status === "IN_PROGRESS") inProgress += 1;
    else notStarted += 1;
    if (isOverdue(fact, now)) overdue += 1;
  }
  return {
    total: facts.length,
    completed,
    inProgress,
    notStarted,
    overdue,
    completedLate,
    completionRate:
      facts.length > 0 ? Math.round((completed / facts.length) * 1000) / 1000 : null,
  };
}

export interface CompletionGroup extends CompletionSummary {
  key: string | null;
  label: string;
}

const GROUP_ACCESSORS: Record<
  ReportGroupBy,
  (f: AssignmentFact) => { key: string | null; label: string }
> = {
  department: (f) => ({
    key: f.departmentId,
    label: f.departmentName ?? "No department",
  }),
  location: (f) => ({
    key: f.locationId,
    label: f.locationName ?? "No location",
  }),
  member: (f) => ({ key: f.membershipId, label: f.memberName }),
};

export function groupFacts(
  facts: AssignmentFact[],
  groupBy: ReportGroupBy,
  now: Date,
): CompletionGroup[] {
  const accessor = GROUP_ACCESSORS[groupBy];
  const buckets = new Map<
    string | null,
    { label: string; facts: AssignmentFact[] }
  >();
  for (const fact of facts) {
    const { key, label } = accessor(fact);
    const bucket = buckets.get(key);
    if (bucket) bucket.facts.push(fact);
    else buckets.set(key, { label, facts: [fact] });
  }
  return [...buckets]
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      ...summarize(bucket.facts, now),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
