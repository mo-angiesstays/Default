import type {
  IssueSeverity,
  IssueStatus,
  Role,
  TaskPriority,
  TaskStatus,
  TaskType,
} from "@prisma/client";

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  UNASSIGNED: "Unassigned",
  ASSIGNED: "Assigned",
  ACCEPTED: "Accepted",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
  VERIFIED: "Verified",
  CANCELLED: "Cancelled",
};

export const TASK_STATUS_CLASS: Record<TaskStatus, string> = {
  UNASSIGNED: "bg-ochre-100 text-ochre-800 ring-ochre-200",
  ASSIGNED: "bg-brand-100 text-brand-800 ring-brand-200",
  ACCEPTED: "bg-brand-200/60 text-brand-800 ring-brand-300",
  IN_PROGRESS: "bg-clay-100 text-clay-800 ring-clay-200",
  BLOCKED: "bg-rust-100 text-rust-800 ring-rust-200",
  COMPLETED: "bg-moss-100 text-moss-800 ring-moss-200",
  VERIFIED: "bg-moss-600 text-white ring-moss-700",
  CANCELLED: "bg-ink-100 text-ink-400 ring-ink-200 line-through",
};

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  TURNOVER: "Turnover",
  DEEP_CLEAN: "Deep clean",
  MAINTENANCE: "Maintenance",
  INSPECTION: "Inspection",
  CUSTOM: "Custom",
};

export const TASK_TYPE_CLASS: Record<TaskType, string> = {
  TURNOVER: "bg-brand-50 text-brand-700 ring-brand-200",
  DEEP_CLEAN: "bg-moss-50 text-moss-700 ring-moss-200",
  MAINTENANCE: "bg-clay-50 text-clay-700 ring-clay-200",
  INSPECTION: "bg-ochre-50 text-ochre-700 ring-ochre-200",
  CUSTOM: "bg-ink-100 text-ink-600 ring-ink-200",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export const PRIORITY_CLASS: Record<TaskPriority, string> = {
  LOW: "bg-ink-100 text-ink-500 ring-ink-200",
  NORMAL: "bg-ink-100 text-ink-600 ring-ink-200",
  HIGH: "bg-ochre-100 text-ochre-900 ring-ochre-300",
  URGENT: "bg-rust-600 text-white ring-rust-700",
};

export const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const SEVERITY_CLASS: Record<IssueSeverity, string> = {
  LOW: "bg-ink-100 text-ink-500 ring-ink-200",
  MEDIUM: "bg-ochre-100 text-ochre-800 ring-ochre-200",
  HIGH: "bg-clay-200 text-clay-900 ring-clay-300",
  URGENT: "bg-rust-600 text-white ring-rust-700",
};

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  OPEN: "Open",
  ACKNOWLEDGED: "Acknowledged",
  IN_PROGRESS: "Being fixed",
  RESOLVED: "Resolved",
};

export const ISSUE_STATUS_CLASS: Record<IssueStatus, string> = {
  OPEN: "bg-rust-100 text-rust-800 ring-rust-200",
  ACKNOWLEDGED: "bg-ochre-100 text-ochre-800 ring-ochre-200",
  IN_PROGRESS: "bg-brand-100 text-brand-800 ring-brand-200",
  RESOLVED: "bg-moss-100 text-moss-800 ring-moss-200",
};

export const ROLE_LABEL: Record<Role, string> = {
  MANAGER: "Manager",
  CLEANER: "Cleaner",
  MAINTENANCE: "Maintenance",
};
