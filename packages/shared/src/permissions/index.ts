/**
 * The fixed permission catalogue. Roles are data (created per organisation
 * by admins); the permissions they can be granted are code, defined here.
 * The Owner membership bypasses all checks and implicitly holds everything.
 */
export const PERMISSIONS = {
  "org.manage": "Edit organisation settings, locations, and departments",
  "member.invite": "Invite new team members",
  "member.manage": "Edit members' roles and departments, remove members",
  "role.manage": "Create and edit roles and their permissions",
  "task.create": "Create tasks and assign them to staff or departments",
  "task.manage": "Edit, reschedule, and delete any task",
  "template.manage": "Create and edit task templates",
  "dashboard.org": "View the organisation-wide dashboard",
  "dashboard.department": "View dashboards for own departments",
  "report.export": "Export PDF and Excel reports",
  "audit.view": "View the audit trail",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as [
  Permission,
  ...Permission[],
];

export interface PermissionHolder {
  isOwner: boolean;
  permissions: ReadonlySet<string>;
}

export function hasPermission(
  holder: PermissionHolder,
  permission: Permission,
): boolean {
  return holder.isOwner || holder.permissions.has(permission);
}
