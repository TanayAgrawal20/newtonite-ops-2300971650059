import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import {
  createWorkItemSchema,
  listWorkItemsSchema,
  transitionWorkItemSchema,
  updateWorkItemSchema,
} from "./work-items.validation";

import {
  createWorkItem,
  listWorkItems,
  transitionWorkItem,
  updateWorkItem,
  claimWorkItem,
  getWorkItemActivity,
  getWorkItemDashboard,
  getWorkItemById,
} from "./work-items.service";

const router = Router();

router.post("/", requireAuth, async (req, res) => {
  try {
    const parsed = createWorkItemSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid work-item data.",
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    const actor = (req as AuthenticatedRequest).auth;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
      return;
    }

    const idempotencyKey = req.get("Idempotency-Key")?.trim();

    if (idempotencyKey && idempotencyKey.length > 255) {
      res.status(400).json({
        success: false,
        message: "Idempotency-Key must not exceed 255 characters.",
      });
      return;
    }

    const workItem = await createWorkItem(
      parsed.data,
      actor,
      idempotencyKey || undefined,
    );

    res.status(201).json({
      success: true,
      data: workItem,
    });
  } catch (error) {
    if (error instanceof Error) {
      const statusByError: Record<string, number> = {
        TEAM_NOT_FOUND: 404,
        TEAM_ACCESS_DENIED: 403,
        CREATE_PERMISSION_DENIED: 403,
        ASSIGNEE_NOT_IN_TEAM: 400,
        IDEMPOTENCY_KEY_REUSED: 409,
      };

      const status = statusByError[error.message];

      if (status) {
        res.status(status).json({
          success: false,
          message: error.message,
        });
        return;
      }
    }

    console.error("Create work item failed:", error);

    res.status(500).json({
      success: false,
      message: "Unable to create work item.",
    });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const parsed = updateWorkItemSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid work-item update data.",
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    const actor = (req as AuthenticatedRequest).auth;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
      return;
    }

    const workItem = await updateWorkItem(
      req.params.id as string,
      parsed.data,
      actor,
    );

    res.status(200).json({
      success: true,
      data: workItem,
    });
  } catch (error) {
    const statusByError: Record<string, number> = {
      WORK_ITEM_NOT_FOUND: 404,
      WORK_ITEM_ACCESS_DENIED: 403,
      WORK_ITEM_PERMISSION_DENIED: 403,
      ASSIGNEE_NOT_IN_TEAM: 400,
      VERSION_CONFLICT: 409,
    };

    if (error instanceof Error && statusByError[error.message]) {
      res.status(statusByError[error.message]).json({
        success: false,
        message: error.message,
      });
      return;
    }

    console.error("Update work item failed:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update work item.",
    });
  }
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const parsed = listWorkItemsSchema.safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid work-item query parameters.",
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    const actor = (req as AuthenticatedRequest).auth;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
      return;
    }

    const result = await listWorkItems(parsed.data, actor);

    res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("List work items failed:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve work items.",
    });
  }
});

router.patch("/:id/status", requireAuth, async (req, res) => {
  try {
    const parsed = transitionWorkItemSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid status transition data.",
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    const actor = (req as AuthenticatedRequest).auth;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
      return;
    }

    const workItem = await transitionWorkItem(
      req.params.id as string,
      parsed.data,
      actor,
    );

    res.status(200).json({
      success: true,
      data: workItem,
    });
  } catch (error) {
    const statusByError: Record<string, number> = {
      WORK_ITEM_NOT_FOUND: 404,
      WORK_ITEM_ACCESS_DENIED: 403,
      WORK_ITEM_PERMISSION_DENIED: 403,
      LEAD_APPROVAL_REQUIRED: 403,
      INVALID_STATUS_TRANSITION: 409,
      VERSION_CONFLICT: 409,
    };

    if (error instanceof Error && statusByError[error.message]) {
      res.status(statusByError[error.message]).json({
        success: false,
        message: error.message,
      });
      return;
    }

    console.error("Status transition failed:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update work-item status.",
    });
  }
});

router.post("/:id/claim", requireAuth, async (req, res) => {
  try {
    const actor = (req as AuthenticatedRequest).auth;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
      return;
    }

    const workItem = await claimWorkItem(req.params.id as string, actor);

    res.status(200).json({
      success: true,
      data: workItem,
    });
  } catch (error) {
    const statusByError: Record<string, number> = {
      WORK_ITEM_NOT_FOUND: 404,
      WORK_ITEM_ACCESS_DENIED: 403,
      CLAIM_PERMISSION_DENIED: 403,
      WORK_ITEM_NOT_OPEN: 409,
      WORK_ITEM_ALREADY_ASSIGNED: 409,
      CLAIM_CONFLICT: 409,
    };

    if (error instanceof Error && statusByError[error.message]) {
      res.status(statusByError[error.message]).json({
        success: false,
        message: error.message,
      });
      return;
    }

    console.error("Claim work item failed:", error);

    res.status(500).json({
      success: false,
      message: "Unable to claim work item.",
    });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const actor = (req as AuthenticatedRequest).auth;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
      return;
    }

    const workItem = await getWorkItemById(req.params.id as string, actor);

    res.status(200).json({
      success: true,
      data: workItem,
    });
  } catch (error) {
    const statusByError: Record<string, number> = {
      WORK_ITEM_NOT_FOUND: 404,
      WORK_ITEM_ACCESS_DENIED: 403,
    };

    if (error instanceof Error && statusByError[error.message]) {
      res.status(statusByError[error.message]).json({
        success: false,
        message: error.message,
      });
      return;
    }

    console.error("Get work item failed:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve work item.",
    });
  }
});

router.get("/:id/activity", requireAuth, async (req, res) => {
  try {
    const actor = (req as AuthenticatedRequest).auth;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
      return;
    }

    const activity = await getWorkItemActivity(req.params.id as string, actor);

    res.status(200).json({
      success: true,
      data: activity,
    });
  } catch (error) {
    const statusByError: Record<string, number> = {
      WORK_ITEM_NOT_FOUND: 404,
      WORK_ITEM_ACCESS_DENIED: 403,
    };

    if (error instanceof Error && statusByError[error.message]) {
      res.status(statusByError[error.message]).json({
        success: false,
        message: error.message,
      });
      return;
    }

    console.error("Get work-item activity failed:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve work-item activity.",
    });
  }
});

router.get("/dashboard", requireAuth, async (req, res) => {
  try {
    const actor = (req as AuthenticatedRequest).auth;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
      return;
    }

    const dashboard = await getWorkItemDashboard(actor);

    res.status(200).json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    console.error("Get dashboard failed:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve dashboard.",
    });
  }
});

export default router;
