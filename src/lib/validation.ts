import { z } from "zod";

export const roleEnum = z.enum(["MANAGER", "CLEANER", "MAINTENANCE"]);
export const taskTypeEnum = z.enum([
  "TURNOVER",
  "DEEP_CLEAN",
  "MAINTENANCE",
  "INSPECTION",
  "CUSTOM",
]);
export const taskStatusEnum = z.enum([
  "UNASSIGNED",
  "ASSIGNED",
  "ACCEPTED",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "VERIFIED",
  "CANCELLED",
]);
export const priorityEnum = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
export const checklistTypeEnum = z.enum([
  "TURNOVER",
  "DEEP_CLEAN",
  "MAINTENANCE",
  "INSPECTION",
  "CUSTOM",
]);
export const issueCategoryEnum = z.enum([
  "MAINTENANCE",
  "DAMAGE",
  "SUPPLIES",
  "SAFETY",
  "CLEANLINESS",
  "APPLIANCE",
  "OTHER",
]);
export const issueSeverityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const issueStatusEnum = z.enum(["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"]);
export const ruleKindEnum = z.enum(["ASSIGNMENT", "TIMING", "WORKLOAD", "ESCALATION"]);

/** Accepts an ISO string or a Date and yields a Date. */
export const dateish = z.union([z.string(), z.date()]).transform((value, ctx) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    ctx.addIssue({ code: "custom", message: "Not a valid date" });
    return z.NEVER;
  }
  return date;
});

export const optionalDateish = dateish.nullish();

/** Query params arrive as strings; coerce the ones we treat as numbers/bools. */
export const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : v === "true" || v === "1"));

export const intish = z.coerce.number().int();

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8, "Use at least 8 characters"),
  role: roleEnum,
  phone: z.string().optional().nullable(),
  timezone: z.string().default("America/New_York"),
  skills: z.array(z.string()).default([]),
  maxDailyTasks: z.number().int().min(1).max(20).default(4),
  hourlyRate: z.number().nonnegative().nullish(),
  avatarColor: z.string().default("#3388fb"),
  notes: z.string().nullish(),
});

export const updateUserSchema = createUserSchema
  .partial()
  .omit({ password: true })
  .extend({
    password: z.string().min(8).optional(),
    active: z.boolean().optional(),
  });

export const propertySchema = z.object({
  name: z.string().min(1),
  nickname: z.string().nullish(),
  addressLine1: z.string().nullish(),
  addressLine2: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  postalCode: z.string().nullish(),
  country: z.string().default("US"),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  timezone: z.string().default("America/New_York"),
  bedrooms: z.number().int().min(0).default(1),
  bathrooms: z.number().min(0).default(1),
  hostawayListingId: z.string().nullish(),
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/).default("16:00"),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/).default("10:00"),
  turnoverMinutes: z.number().int().min(15).max(1440).default(180),
  deepCleanMinutes: z.number().int().min(15).max(1440).default(300),
  deepCleanDayOfMonth: z.number().int().min(1).max(28).nullish(),
  deepCleanEnabled: z.boolean().default(true),
  accessNotes: z.string().nullish(),
  parkingNotes: z.string().nullish(),
  wifiName: z.string().nullish(),
  wifiPassword: z.string().nullish(),
  supplyNotes: z.string().nullish(),
  color: z.string().default("#61708d"),
  active: z.boolean().default(true),
});

export const updatePropertySchema = propertySchema.partial();

export const createTaskSchema = z.object({
  propertyId: z.string().min(1),
  type: taskTypeEnum,
  title: z.string().min(1).optional(),
  description: z.string().nullish(),
  scheduledStart: optionalDateish,
  scheduledEnd: optionalDateish,
  dueAt: optionalDateish,
  estimatedMinutes: z.number().int().min(5).max(1440).optional(),
  priority: priorityEnum.default("NORMAL"),
  assigneeId: z.string().nullish(),
  checklistTemplateId: z.string().nullish(),
  skipChecklist: z.boolean().default(false),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullish(),
  status: taskStatusEnum.optional(),
  priority: priorityEnum.optional(),
  assigneeId: z.string().nullish(),
  scheduledStart: optionalDateish,
  scheduledEnd: optionalDateish,
  dueAt: optionalDateish,
  estimatedMinutes: z.number().int().min(5).max(1440).optional(),
  completionNotes: z.string().nullish(),
});

export const checklistItemInput = z.object({
  id: z.string().optional(),
  section: z.string().default("General"),
  title: z.string().min(1),
  description: z.string().nullish(),
  position: z.number().int().min(0).default(0),
  required: z.boolean().default(true),
  photoRequired: z.boolean().default(false),
});

export const checklistTemplateSchema = z.object({
  name: z.string().min(1),
  type: checklistTypeEnum,
  description: z.string().nullish(),
  propertyId: z.string().nullish(),
  active: z.boolean().default(true),
  items: z.array(checklistItemInput).default([]),
});

export const updateChecklistTemplateSchema = checklistTemplateSchema.partial();

export const createIssueSchema = z.object({
  propertyId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullish(),
  category: issueCategoryEnum.default("MAINTENANCE"),
  severity: issueSeverityEnum.default("MEDIUM"),
  photoUrls: z.array(z.string()).default([]),
  originTaskId: z.string().nullish(),
  /** Open a maintenance job for it straight away. */
  createMaintenanceTask: z.boolean().default(false),
});

export const updateIssueSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullish(),
  category: issueCategoryEnum.optional(),
  severity: issueSeverityEnum.optional(),
  status: issueStatusEnum.optional(),
  resolutionNotes: z.string().nullish(),
  photoUrls: z.array(z.string()).optional(),
});

export const clockInSchema = z.object({
  taskId: z.string().nullish(),
  propertyId: z.string().nullish(),
  notes: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
});

export const clockOutSchema = z.object({
  notes: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
});

export const schedulingRuleSchema = z.object({
  name: z.string().min(1),
  instruction: z.string().min(1, "Describe the rule in plain English"),
  kind: ruleKindEnum.default("ASSIGNMENT"),
  propertyId: z.string().nullish(),
  taskTypes: z.array(taskTypeEnum).default([]),
  hard: z.boolean().default(false),
  weight: z.number().int().min(1).max(10).default(5),
  active: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).nullish(),
});

export const updateSchedulingRuleSchema = schedulingRuleSchema.partial();

export const sendMessageSchema = z.object({
  body: z.string().min(1).max(4000),
  attachments: z.array(z.string()).default([]),
});

export const createChannelSchema = z.object({
  type: z.enum(["DIRECT", "GROUP", "PROPERTY", "ANNOUNCEMENT"]),
  name: z.string().nullish(),
  propertyId: z.string().nullish(),
  memberIds: z.array(z.string()).default([]),
});
