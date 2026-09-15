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
  UNASSIGNED: "bg-amber-100 text-amber-800 ring-amber-200",
  ASSIGNED: "bg-blue-100 text-blue-800 ring-blue-200",
  ACCEPTED: "bg-indigo-100 text-indigo-800 ring-indigo-200",
  IN_PROGRESS: "bg-violet-100 text-violet-800 ring-violet-200",
  BLOCKED: "bg-red-100 text-red-800 ring-red-200",
  COMPLETED: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  VERIFIED: "bg-emerald-600 text-white ring-emerald-700",
  CANCELLED: "bg-ink-100 text-ink-500 ring-ink-200 line-through",
};

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  TURNOVER: "Turnover",
  DEEP_CLEAN: "Deep clean",
  MAINTENANCE: "Maintenance",
  INSPECTION: "Inspection",
  CUSTOM: "Custom",
};

export const TASK_TYPE_CLASS: Record<TaskType, string> = {
  TURNOVER: "bg-sky-50 text-sky-700 ring-sky-200",
  DEEP_CLEAN: "bg-purple-50 text-purple-700 ring-purple-200",
  MAINTENANCE: "bg-orange-50 text-orange-700 ring-orange-200",
  INSPECTION: "bg-teal-50 text-teal-700 ring-teal-200",
  CUSTOM: "bg-ink-50 text-ink-700 ring-ink-200",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export const PRIORITY_CLASS: Record<TaskPriority, string> = {
  LOW: "bg-ink-100 text-ink-600 ring-ink-200",
  NORMAL: "bg-ink-100 text-ink-700 ring-ink-200",
  HIGH: "bg-amber-100 text-amber-900 ring-amber-300",
  URGENT: "bg-red-600 text-white ring-red-700",
};

export const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const SEVERITY_CLASS: Record<IssueSeverity, string> = {
  LOW: "bg-ink-100 text-ink-600 ring-ink-200",
  MEDIUM: "bg-amber-100 text-amber-800 ring-amber-200",
  HIGH: "bg-orange-100 text-orange-800 ring-orange-300",
  URGENT: "bg-red-600 text-white ring-red-700",
};

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  OPEN: "Open",
  ACKNOWLEDGED: "Acknowledged",
  IN_PROGRESS: "Being fixed",
  RESOLVED: "Resolved",
};

export const ISSUE_STATUS_CLASS: Record<IssueStatus, string> = {
  OPEN: "bg-red-100 text-red-800 ring-red-200",
  ACKNOWLEDGED: "bg-amber-100 text-amber-800 ring-amber-200",
  IN_PROGRESS: "bg-blue-100 text-blue-800 ring-blue-200",
  RESOLVED: "bg-emerald-100 text-emerald-800 ring-emerald-200",
};

export const ROLE_LABEL: Record<Role, string> = {
  MANAGER: "Manager",
  CLEANER: "Cleaner",
  MAINTENANCE: "Maintenance",
};
