import { prisma } from "../lib/prisma";
import { notifyMembership } from "../modules/notifications/notifications.service";

// Sweeps for incomplete tasks that are past the org's overdueEscalationDays
// threshold and notifies the organisation owner. escalatedToOwnerAt is claimed
// first so the owner only receives one notification per assignment regardless
// of how many times the sweep runs.
export async function sweepEscalation(now: Date = new Date()): Promise<void> {
  const orgs = await prisma.organization.findMany({
    where: { overdueEscalationDays: { not: null } },
    select: { id: true, overdueEscalationDays: true },
  });

  for (const org of orgs) {
    const thresholdDate = new Date(
      now.getTime() - org.overdueEscalationDays! * 24 * 60 * 60 * 1000,
    );

    const assignments = await prisma.taskAssignment.findMany({
      where: {
        escalatedToOwnerAt: null,
        status: { not: "COMPLETED" },
        task: {
          organizationId: org.id,
          dueAt: { lt: thresholdDate },
        },
      },
      include: {
        task: {
          include: {
            department: { select: { name: true } },
          },
        },
        membership: {
          select: { id: true, user: { select: { name: true } } },
        },
      },
      take: 200,
    });

    if (assignments.length === 0) continue;

    await prisma.taskAssignment.updateMany({
      where: { id: { in: assignments.map((a) => a.id) } },
      data: { escalatedToOwnerAt: now },
    });

    const owner = await prisma.membership.findFirst({
      where: { organizationId: org.id, isOwner: true },
      select: { id: true },
    });
    if (!owner) continue;

    for (const assignment of assignments) {
      const { task } = assignment;
      const msOverdue = now.getTime() - task.dueAt!.getTime();
      const daysOverdue = Math.floor(msOverdue / (1000 * 60 * 60 * 24));
      const deptClause = task.department
        ? ` (${task.department.name})`
        : "";

      await notifyMembership({
        organizationId: org.id,
        membershipId: owner.id,
        type: "task.escalation",
        title: `Escalation: ${task.title}`,
        body: `${assignment.membership.user.name}${deptClause} has not completed "${task.title}" — ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue.`,
        taskId: task.id,
        assigneeName: assignment.membership.user.name,
        departmentName: task.department?.name,
        daysOverdue,
      });
    }
  }
}
