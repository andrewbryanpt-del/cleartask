import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

// Shared org-level lookups used by multiple features (selects, admin).

export interface OrgDepartment {
  id: string;
  name: string;
}
export interface OrgLocation {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  departments: OrgDepartment[];
}
export interface Organization {
  id: string;
  name: string;
  industry: string | null;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  overdueEscalationDays: number | null;
  locations: OrgLocation[];
}

export function useOrganization() {
  return useQuery({
    queryKey: ["organization"],
    queryFn: () => api<Organization>("/organization"),
  });
}

export interface Member {
  membershipId: string;
  isOwner: boolean;
  role: { id: string; name: string } | null;
  departments: { id: string; name: string; locationId: string }[];
  locations: { id: string; name: string }[];
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}

export function useMembers() {
  return useQuery({
    queryKey: ["members"],
    queryFn: () => api<Member[]>("/members"),
  });
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  memberCount: number;
}

export function useRoles() {
  return useQuery({ queryKey: ["roles"], queryFn: () => api<Role[]>("/roles") });
}

export interface TaskTemplate {
  id: string;
  title: string;
  description: string | null;
  reminderOffsetsMinutes: number[];
  taskCount: number;
  attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number }[];
}

export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: () => api<TaskTemplate[]>("/task-templates"),
  });
}
