import type { FastifyInstance } from "fastify";
import {
  dashboardQuerySchema,
  hasPermission,
  isRestrictedToOwnTasks,
} from "@task-tracker/shared";
import { prisma } from "../../lib/prisma";
import { forbidden } from "../../lib/errors";
import {
  fetchAssignmentFacts,
  groupFacts,
  isOverdue,
  summarize,
  type AssignmentFact,
} from "../reports/reports.service";

function taskList(facts: AssignmentFact[], limit: number) {
  return facts.slice(0, limit).map((f) => ({
    taskId: f.taskId,
    title: f.taskTitle,
    dueAt: f.dueAt,
    status: f.status,
    memberName: f.memberName,
  }));
}

export default async function dashboardRoutes(app: FastifyInstance) {
  // Personal dashboard: the caller's own assignments.
  app.get("/dashboard/me", { preHandler: app.authenticate }, async (req) => {
    const now = new Date();
    const facts = await fetchAssignmentFacts(req.auth.organizationId, {
      membershipId: req.auth.membershipId,
    });
    const open = facts.filter((f) => f.status !== "COMPLETED");
    const overdue = open
      .filter((f) => isOverdue(f, now))
      .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());
    const upcoming = open
      .filter((f) => f.dueAt && f.dueAt.getTime() >= now.getTime())
      .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());

    return {
      summary: summarize(facts, now),
      overdue: taskList(overdue, 10),
      upcoming: taskList(upcoming, 10),
    };
  });

  // Department dashboard: holders of dashboard.department see their own
  // departments; dashboard.org (or the owner) may inspect any department.
  app.get(
    "/dashboard/department",
    { preHandler: app.authenticate },
    async (req) => {
      if (isRestrictedToOwnTasks(req.auth)) {
        throw forbidden("Your role is limited to your personal dashboard");
      }
      const query = dashboardQuerySchema.parse(req.query);
      const orgWide =
        req.auth.isOwner || hasPermission(req.auth, "dashboard.org");
      if (!orgWide && !hasPermission(req.auth, "dashboard.department")) {
        throw forbidden("Missing permission: dashboard.department");
      }

      const departments = orgWide
        ? await prisma.department.findMany({
            where: { organizationId: req.auth.organizationId },
            select: { id: true, name: true },
          })
        : (
            await prisma.membership.findUniqueOrThrow({
              where: { id: req.auth.membershipId },
              select: { departments: { select: { id: true, name: true } } },
            })
          ).departments;

      const scoped = query.departmentId
        ? departments.filter((d) => d.id === query.departmentId)
        : departments;
      if (query.departmentId && scoped.length === 0) {
        throw forbidden("Not your department");
      }

      const now = new Date();
      const facts = await fetchAssignmentFacts(req.auth.organizationId, {
        departmentIds: scoped.map((d) => d.id),
      });
      const byDepartment = new Map<string, AssignmentFact[]>();
      for (const fact of facts) {
        if (!fact.departmentId) continue;
        const list = byDepartment.get(fact.departmentId);
        if (list) list.push(fact);
        else byDepartment.set(fact.departmentId, [fact]);
      }

      return {
        departments: scoped.map((dept) => {
          const deptFacts = byDepartment.get(dept.id) ?? [];
          const overdue = deptFacts
            .filter((f) => isOverdue(f, now))
            .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());
          return {
            department: dept,
            summary: summarize(deptFacts, now),
            members: groupFacts(deptFacts, "member", now),
            overdue: taskList(overdue, 10),
          };
        }),
      };
    },
  );

  // Organization dashboard.
  app.get(
    "/dashboard/organization",
    { preHandler: app.requirePermission("dashboard.org") },
    async (req) => {
      if (isRestrictedToOwnTasks(req.auth)) {
        throw forbidden("Your role is limited to your personal dashboard");
      }
      const now = new Date();
      const facts = await fetchAssignmentFacts(req.auth.organizationId);
      const overdue = facts
        .filter((f) => isOverdue(f, now))
        .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());

      return {
        summary: summarize(facts, now),
        byLocation: groupFacts(facts, "location", now),
        byDepartment: groupFacts(facts, "department", now),
        overdue: taskList(overdue, 10),
      };
    },
  );
}
