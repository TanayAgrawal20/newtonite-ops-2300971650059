import { z } from "zod";

export const createWorkItemSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Title must contain at least 3 characters.")
    .max(150, "Title cannot exceed 150 characters."),

  description: z
    .string()
    .trim()
    .max(5000, "Description cannot exceed 5000 characters.")
    .optional(),

  type: z.enum(["TASK", "BUG", "INCIDENT", "REQUEST"]).default("TASK"),

  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),

  teamId: z.string().uuid("A valid team ID is required."),

  assigneeId: z
    .string()
    .uuid("Assignee ID must be a valid UUID.")
    .nullable()
    .optional(),

  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
});

export const listWorkItemsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(150).optional(),
  status: z
    .enum(["OPEN", "IN_PROGRESS", "AWAITING_APPROVAL", "RESOLVED", "CLOSED"])
    .optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  type: z.enum(["TASK", "BUG", "INCIDENT", "REQUEST"]).optional(),
  teamId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
});

export const transitionWorkItemSchema = z.object({
  status: z.enum([
    "OPEN",
    "IN_PROGRESS",
    "AWAITING_APPROVAL",
    "RESOLVED",
    "CLOSED",
  ]),
  version: z.coerce.number().int().min(1),
});

export const updateWorkItemSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Title must contain at least 3 characters.")
      .max(150, "Title cannot exceed 150 characters.")
      .optional(),

    description: z
      .string()
      .trim()
      .max(5000, "Description cannot exceed 5000 characters.")
      .nullable()
      .optional(),

    type: z.enum(["TASK", "BUG", "INCIDENT", "REQUEST"]).optional(),

    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),

    assigneeId: z.string().uuid().nullable().optional(),

    dueDate: z.string().datetime({ offset: true }).nullable().optional(),

    version: z.coerce.number().int().min(1),
  })
  .refine((data) => Object.keys(data).some((key) => key !== "version"), {
    message: "Provide at least one field to update.",
  });

export type UpdateWorkItemInput = z.infer<typeof updateWorkItemSchema>;

export type TransitionWorkItemInput = z.infer<typeof transitionWorkItemSchema>;

export type CreateWorkItemInput = z.infer<typeof createWorkItemSchema>;
export type ListWorkItemsInput = z.infer<typeof listWorkItemsSchema>;
