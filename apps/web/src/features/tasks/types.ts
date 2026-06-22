// Response shapes from the tasks API (apps/api/src/modules/tasks).

export interface TaskListItem {
  id: string;
  title: string;
  priority: "URGENT" | "HIGH" | "NORMAL" | "LOW";
  dueAt: string | null;
  location: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  createdAt: string;
  commentCount: number;
  attachmentCount: number;
  assigneeCount: number;
  completedCount: number;
  myStatus: string | null;
}

export interface TaskListResponse {
  items: TaskListItem[];
  nextCursor: string | null;
}

export interface TaskAssignmentDetail {
  id: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  completedAt: string | null;
  sourceDepartmentId: string | null;
  membership: {
    id: string;
    user: { id: string; name: string; avatarUrl: string | null };
  };
  proofs: {
    id: string;
    type: string;
    fileName: string | null;
    mimeType: string | null;
    url: string | null;
    createdAt: string;
  }[];
}

export interface TaskCommentDetail {
  id: string;
  body: string;
  createdAt: string;
  author: { membershipId: string; name: string; avatarUrl: string | null };
}

export interface TaskAttachmentDetail {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl: string;
  viewedByMe: boolean;
  acknowledgedByMe: boolean;
  viewCount: number;
  acknowledgeCount: number;
  views?: {
    membershipId: string;
    viewedAt: string;
    acknowledgedAt: string | null;
  }[];
  acknowledgementStatus?: {
    membershipId: string;
    name: string;
    acknowledgedAt: string | null;
  }[];
}

export interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  priority: "URGENT" | "HIGH" | "NORMAL" | "LOW";
  dueAt: string | null;
  reminderOffsetsMinutes: number[];
  location: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  template: { id: string; title: string } | null;
  createdByMembershipId: string | null;
  createdAt: string;
  updatedAt: string;
  assignments: TaskAssignmentDetail[];
  comments: TaskCommentDetail[];
  attachments: TaskAttachmentDetail[];
}
