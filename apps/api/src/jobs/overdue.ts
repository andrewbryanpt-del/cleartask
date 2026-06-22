import { prisma } from "../lib/prisma";
import { notifyMembership } from "../modules/notifications/notifications.service";

// Sweeps assignments past their task's dueAt that aren't completed, and
// notifies the assignee plus the holders of the department-scoped dashboard
// permission for the task's department. overdueNotifiedAt is claimed first
// so each assignment escalates exactly once.
export async function sweepOverdue(now: Date = new Date()): Promise<void> {
  const assignments = await prisma.taskAssignment.findMany({
    where: {
      overdueNotifiedAt: null,
      status: { not: "COMPLETED" },
      task: { dueAt: { lt: now } },
    },
    include: {
      task: true,
      membership: {
        select: { id: true, user: { select: { name: true } } },
      },
    },
    take: 500,
  });
  if (assignments.length === 0) return;

  await prisma.taskAssignment.updateMany({
    where: { id: { in: assignments.map((a) => a.id) } },
    data: { overdueNotifiedAt: now },
  });

  // Department managers are looked up once per department, not per
  // assignment.
  const departmentIds = [
    ...new Set(
      assignments
        .map((a) => a.task.departmentId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const managers = await prisma.membership.findMany({
    where: {
      departments: { some: { id: { in: departmentIds } } },
      role: {
        permissions: { some: { permission: "dashboard.department" } },
      },
    },
    select: { id: true, departments: { select: { id: true } } },
  });

  for (const assignment of assignments) {
    const { task } = assignment;
    await notifyMembership({
      organizationId: task.organizationId,
      membershipId: assignment.membershipId,
      type: "task.overdue",
      title: `Overdue: ${task.title}`,
      body: `"${task.title}" was due ${task.dueAt!.toUTCString()} and is not completed.`,
      taskId: task.id,
    });

    const escalateTo = new Set<string>();
    if (task.departmentId) {
      for (const m of managers) {
        if (m.departments.some((d) => d.id === task.departmentId)) {
          escalateTo.add(m.id);
        }
      }
    } else if (task.createdByMembershipId) {
      escalateTo.add(task.createdByMembershipId);
    }
    escalateTo.delete(assignment.membershipId);

    for (const membershipId of escalateTo) {
      await notifyMembership({
        organizationId: task.organizationId,
        membershipId,
        type: "task.overdue",
        title: `Overdue in your team: ${task.title}`,
        body: `${assignment.membership.user.name} has not completed "${task.title}" (due ${task.dueAt!.toUTCString()}).`,
        taskId: task.id,
        assigneeName: assignment.membership.user.name,
      });
    }
  }
}
