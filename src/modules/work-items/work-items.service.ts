import { prisma } from "../../lib/prisma";
import type { UpdateWorkItemInput } from "./work-items.validation";
import type { AuthenticatedUser } from "../../middleware/auth.middleware";
import type { CreateWorkItemInput } from "./work-items.validation";
import type { ListWorkItemsInput } from "./work-items.validation";
import type { TransitionWorkItemInput } from "./work-items.validation";
import { enqueueOutboxJob } from "../outbox/outbox.service";
import { createHash } from "node:crypto";
import type { CreateWorkItemCommentInput } from "./work-items.validation";
import {
  decodeWorkItemCursor,
  encodeWorkItemCursor,
} from "./work-items.cursor";
import type { WorkItemListResponse } from "./work-items.list";

export async function createWorkItem(
  input: CreateWorkItemInput,
  actor: AuthenticatedUser,
  idempotencyKey?: string,
) {
  const requestHash = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");

  // Check that the team exists.
  const team = await prisma.team.findUnique({
    where: { id: input.teamId },
    select: { id: true },
  });

  if (!team) {
    throw new Error("TEAM_NOT_FOUND");
  }

  // Check team membership and permission.
  const membership = actor.memberships.find(
    (item) => item.teamId === input.teamId,
  );

  if (actor.globalRole !== "ADMIN" && !membership) {
    throw new Error("TEAM_ACCESS_DENIED");
  }

  if (actor.globalRole !== "ADMIN" && membership?.role === "VIEWER") {
    throw new Error("CREATE_PERMISSION_DENIED");
  }

  // Verify that the requested assignee belongs to the team.
  if (input.assigneeId) {
    const assigneeMembership = await prisma.teamMember.findUnique({
      where: {
        userId_teamId: {
          userId: input.assigneeId,
          teamId: input.teamId,
        },
      },
      select: { userId: true },
    });

    if (!assigneeMembership) {
      throw new Error("ASSIGNEE_NOT_IN_TEAM");
    }
  }

  // Without a key, preserve the existing create behavior.
  if (!idempotencyKey) {
    return prisma.$transaction(async (tx) => {
      const workItem = await tx.workItem.create({
        data: {
          title: input.title,
          description: input.description,
          type: input.type,
          priority: input.priority,
          teamId: input.teamId,
          creatorId: actor.id,
          assigneeId: input.assigneeId ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          status: "OPEN",
          version: 1,
        },
        include: {
          team: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true, email: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.activityEvent.create({
        data: {
          workItemId: workItem.id,
          actorId: actor.id,
          action: "CREATED",
          toStatus: "OPEN",
          details: {
            title: workItem.title,
            priority: workItem.priority,
            type: workItem.type,
          },
        },
      });

      await enqueueOutboxJob(tx, "WORK_ITEM_CREATED", {
        workItemId: workItem.id,
        actorId: actor.id,
        version: workItem.version,
      });

      return workItem;
    });
  }

  // Return a previous response when this key has already been used.
  const existing = await prisma.idempotencyRecord.findUnique({
    where: {
      actorId_key: {
        actorId: actor.id,
        key: idempotencyKey,
      },
    },
  });

  if (existing && existing.expiresAt > new Date()) {
    if (existing.requestHash !== requestHash) {
      throw new Error("IDEMPOTENCY_KEY_REUSED");
    }

    return existing.responseBody;
  }

  // Expired keys may be used again.
  if (existing) {
    await prisma.idempotencyRecord.deleteMany({
      where: {
        id: existing.id,
        expiresAt: { lte: new Date() },
      },
    });
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const workItem = await tx.workItem.create({
        data: {
          title: input.title,
          description: input.description,
          type: input.type,
          priority: input.priority,
          teamId: input.teamId,
          creatorId: actor.id,
          assigneeId: input.assigneeId ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          status: "OPEN",
          version: 1,
        },
        include: {
          team: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true, email: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.activityEvent.create({
        data: {
          workItemId: workItem.id,
          actorId: actor.id,
          action: "CREATED",
          toStatus: "OPEN",
          details: {
            title: workItem.title,
            priority: workItem.priority,
            type: workItem.type,
          },
        },
      });

      await enqueueOutboxJob(tx, "WORK_ITEM_CREATED", {
        workItemId: workItem.id,
        actorId: actor.id,
        version: workItem.version,
      });

      // Persist the response in the same transaction as the work item.
      await tx.idempotencyRecord.create({
        data: {
          actorId: actor.id,
          key: idempotencyKey,
          requestHash,
          responseStatus: 201,
          responseBody: JSON.parse(JSON.stringify(workItem)),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      return workItem;
    });
  } catch (error) {
    // Two identical requests may arrive at almost the same time.
    // The unique constraint lets only one transaction create the record.
    const isUniqueConstraintError =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002";

    if (!isUniqueConstraintError) {
      throw error;
    }

    const saved = await prisma.idempotencyRecord.findUnique({
      where: {
        actorId_key: {
          actorId: actor.id,
          key: idempotencyKey,
        },
      },
    });

    if (!saved) {
      throw error;
    }

    if (saved.requestHash !== requestHash) {
      throw new Error("IDEMPOTENCY_KEY_REUSED");
    }

    if (saved.expiresAt <= new Date()) {
      throw error;
    }

    return saved.responseBody;
  }
}

// Add this function below createWorkItem.
// Move the import above to the other imports at the top of the file.

function emptyWorkItemList(limit: number): WorkItemListResponse {
  return {
    items: [],
    nextCursor: null,
    hasMore: false,
    limit,
  };
}

export async function listWorkItems(
  input: ListWorkItemsInput,
  actor: AuthenticatedUser,
): Promise<WorkItemListResponse> {
  const allowedTeamIds =
    actor.globalRole === "ADMIN"
      ? undefined
      : actor.memberships.map((membership) => membership.teamId);

  if (allowedTeamIds && allowedTeamIds.length === 0) {
    return emptyWorkItemList(input.limit);
  }

  const teamIds = input.teamId
    ? allowedTeamIds === undefined || allowedTeamIds.includes(input.teamId)
      ? [input.teamId]
      : []
    : allowedTeamIds;

  if (teamIds && teamIds.length === 0) {
    return emptyWorkItemList(input.limit);
  }

  const cursor = input.cursor ? decodeWorkItemCursor(input.cursor) : null;

  const where = {
    ...(teamIds ? { teamId: { in: teamIds } } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.type ? { type: input.type } : {}),
    ...(input.assigneeId ? { assigneeId: input.assigneeId } : {}),
    ...(input.search
      ? {
          title: {
            contains: input.search,
            mode: "insensitive" as const,
          },
        }
      : {}),
    ...(cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            {
              AND: [
                { createdAt: { equals: cursor.createdAt } },
                { id: { lt: cursor.id } },
              ],
            },
          ],
        }
      : {}),
  };

  const rows = await prisma.workItem.findMany({
    where,
    take: input.limit + 1,
    orderBy:
      input.sort === "createdAt"
        ? [{ createdAt: "desc" }, { id: "desc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      team: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
    },
  });

  const hasMore = rows.length > input.limit;
  const items = hasMore ? rows.slice(0, input.limit) : rows;
  const lastItem = items[items.length - 1];

  return {
    items,
    nextCursor:
      hasMore && lastItem
        ? encodeWorkItemCursor(lastItem.createdAt, lastItem.id)
        : null,
    hasMore,
    limit: input.limit,
  };
}

export async function transitionWorkItem(
  workItemId: string,
  input: TransitionWorkItemInput,
  actor: AuthenticatedUser,
) {
  const allowedTransitions: Record<string, string[]> = {
    OPEN: ["IN_PROGRESS"],
    IN_PROGRESS: ["OPEN", "AWAITING_APPROVAL"],
    AWAITING_APPROVAL: ["IN_PROGRESS", "RESOLVED"],
    RESOLVED: ["CLOSED", "IN_PROGRESS"],
    CLOSED: [],
  };

  return prisma.$transaction(async (tx) => {
    const item = await tx.workItem.findUnique({
      where: { id: workItemId },
      select: {
        id: true,
        teamId: true,
        status: true,
        version: true,
        title: true,
      },
    });

    if (!item) {
      throw new Error("WORK_ITEM_NOT_FOUND");
    }

    const membership = actor.memberships.find(
      (entry) => entry.teamId === item.teamId,
    );

    if (actor.globalRole !== "ADMIN" && !membership) {
      throw new Error("WORK_ITEM_ACCESS_DENIED");
    }

    if (actor.globalRole !== "ADMIN" && membership?.role === "VIEWER") {
      throw new Error("WORK_ITEM_PERMISSION_DENIED");
    }

    if (
      input.status === "RESOLVED" &&
      item.status === "AWAITING_APPROVAL" &&
      actor.globalRole !== "ADMIN" &&
      membership?.role !== "LEAD" &&
      membership?.role !== "ADMIN"
    ) {
      throw new Error("LEAD_APPROVAL_REQUIRED");
    }

    if (input.version !== item.version) {
      throw new Error("VERSION_CONFLICT");
    }

    if (!allowedTransitions[item.status]?.includes(input.status)) {
      throw new Error("INVALID_STATUS_TRANSITION");
    }

    // Conditional update prevents overwriting a concurrent change.
    const updateResult = await tx.workItem.updateMany({
      where: {
        id: item.id,
        version: input.version,
        status: item.status,
      },
      data: {
        status: input.status,
        version: { increment: 1 },
      },
    });

    if (updateResult.count !== 1) {
      throw new Error("VERSION_CONFLICT");
    }

    await tx.activityEvent.create({
      data: {
        workItemId: item.id,
        actorId: actor.id,
        action: "STATUS_CHANGED",
        fromStatus: item.status,
        toStatus: input.status,
        details: {
          previousVersion: item.version,
          newVersion: item.version + 1,
        },
      },
    });

    await enqueueOutboxJob(tx, "WORK_ITEM_STATUS_CHANGED", {
      workItemId: item.id,
      actorId: actor.id,
      version: item.version + 1,
    });

    return tx.workItem.findUniqueOrThrow({
      where: { id: item.id },
      include: {
        team: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
    });
  });
}

export async function updateWorkItem(
  workItemId: string,
  input: UpdateWorkItemInput,
  actor: AuthenticatedUser,
) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.workItem.findUnique({
      where: { id: workItemId },
      select: {
        id: true,
        teamId: true,
        version: true,
        title: true,
        description: true,
        type: true,
        priority: true,
        assigneeId: true,
        dueDate: true,
      },
    });

    if (!item) {
      throw new Error("WORK_ITEM_NOT_FOUND");
    }

    // Verify team access.
    const membership = actor.memberships.find(
      (entry) => entry.teamId === item.teamId,
    );

    if (actor.globalRole !== "ADMIN" && !membership) {
      throw new Error("WORK_ITEM_ACCESS_DENIED");
    }

    // Viewers cannot edit work items.
    if (actor.globalRole !== "ADMIN" && membership?.role === "VIEWER") {
      throw new Error("WORK_ITEM_PERMISSION_DENIED");
    }

    // Reject stale edits.
    if (input.version !== item.version) {
      throw new Error("VERSION_CONFLICT");
    }

    // If assigning someone, verify that they belong to this team.
    if (input.assigneeId !== undefined && input.assigneeId !== null) {
      const assigneeMembership = await tx.teamMember.findUnique({
        where: {
          userId_teamId: {
            userId: input.assigneeId,
            teamId: item.teamId,
          },
        },
        select: { userId: true },
      });

      if (!assigneeMembership) {
        throw new Error("ASSIGNEE_NOT_IN_TEAM");
      }
    }

    const { version, dueDate, ...editableFields } = input;

    const data = {
      ...editableFields,
      ...(dueDate !== undefined
        ? {
            dueDate: dueDate === null ? null : new Date(dueDate),
          }
        : {}),
      version: { increment: 1 },
    };

    // Compare-and-swap: only one edit can update this version.
    const result = await tx.workItem.updateMany({
      where: {
        id: item.id,
        version: input.version,
      },
      data,
    });

    if (result.count !== 1) {
      throw new Error("VERSION_CONFLICT");
    }

    const updatedItem = await tx.workItem.findUniqueOrThrow({
      where: { id: item.id },
      include: {
        team: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    await tx.activityEvent.create({
      data: {
        workItemId: item.id,
        actorId: actor.id,
        action: "UPDATED",
        details: {
          previousVersion: item.version,
          newVersion: updatedItem.version,
          changes: {
            ...(input.title !== undefined
              ? { title: { from: item.title, to: updatedItem.title } }
              : {}),
            ...(input.description !== undefined
              ? {
                  description: {
                    from: item.description,
                    to: updatedItem.description,
                  },
                }
              : {}),
            ...(input.type !== undefined
              ? { type: { from: item.type, to: updatedItem.type } }
              : {}),
            ...(input.priority !== undefined
              ? {
                  priority: {
                    from: item.priority,
                    to: updatedItem.priority,
                  },
                }
              : {}),
            ...(input.assigneeId !== undefined
              ? {
                  assigneeId: {
                    from: item.assigneeId,
                    to: updatedItem.assigneeId,
                  },
                }
              : {}),
            ...(input.dueDate !== undefined
              ? {
                  dueDate: {
                    from: item.dueDate?.toISOString() ?? null,
                    to: updatedItem.dueDate?.toISOString() ?? null,
                  },
                }
              : {}),
          },
        },
      },
    });

    await enqueueOutboxJob(tx, "WORK_ITEM_UPDATED", {
      workItemId: item.id,
      actorId: actor.id,
      version: updatedItem.version,
    });

    return updatedItem;
  });
}

export async function claimWorkItem(
  workItemId: string,
  actor: AuthenticatedUser,
) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.workItem.findUnique({
      where: { id: workItemId },
      select: {
        id: true,
        teamId: true,
        status: true,
        assigneeId: true,
        version: true,
      },
    });

    if (!item) {
      throw new Error("WORK_ITEM_NOT_FOUND");
    }

    const membership = actor.memberships.find(
      (entry) => entry.teamId === item.teamId,
    );

    if (actor.globalRole !== "ADMIN" && !membership) {
      throw new Error("WORK_ITEM_ACCESS_DENIED");
    }

    if (membership?.role === "VIEWER" && actor.globalRole !== "ADMIN") {
      throw new Error("CLAIM_PERMISSION_DENIED");
    }

    if (item.status !== "OPEN") {
      throw new Error("WORK_ITEM_NOT_OPEN");
    }

    if (item.assigneeId !== null) {
      throw new Error("WORK_ITEM_ALREADY_ASSIGNED");
    }

    const updateResult = await tx.workItem.updateMany({
      where: {
        id: item.id,
        assigneeId: null,
        status: "OPEN",
        version: item.version,
      },
      data: {
        assigneeId: actor.id,
        version: { increment: 1 },
      },
    });

    if (updateResult.count !== 1) {
      throw new Error("CLAIM_CONFLICT");
    }

    await tx.activityEvent.create({
      data: {
        workItemId: item.id,
        actorId: actor.id,
        action: "CLAIMED",
        details: {
          assigneeId: actor.id,
          previousVersion: item.version,
          newVersion: item.version + 1,
        },
      },
    });

    await enqueueOutboxJob(tx, "WORK_ITEM_CLAIMED", {
      workItemId: item.id,
      actorId: actor.id,
      version: item.version + 1,
    });

    return tx.workItem.findUniqueOrThrow({
      where: { id: item.id },
      include: {
        team: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    });
  });
}

export async function getWorkItemById(
  workItemId: string,
  actor: AuthenticatedUser,
) {
  const item = await prisma.workItem.findUnique({
    where: { id: workItemId },
    include: {
      team: {
        select: { id: true, name: true },
      },
      assignee: {
        select: { id: true, name: true, email: true },
      },
      creator: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!item) {
    throw new Error("WORK_ITEM_NOT_FOUND");
  }

  const hasTeamAccess = actor.memberships.some(
    (membership) => membership.teamId === item.teamId,
  );

  if (actor.globalRole !== "ADMIN" && !hasTeamAccess) {
    throw new Error("WORK_ITEM_ACCESS_DENIED");
  }

  return item;
}

export async function getWorkItemActivity(
  workItemId: string,
  actor: AuthenticatedUser,
) {
  const item = await prisma.workItem.findUnique({
    where: { id: workItemId },
    select: { id: true, teamId: true },
  });

  if (!item) {
    throw new Error("WORK_ITEM_NOT_FOUND");
  }

  const isMember = actor.memberships.some(
    (membership) => membership.teamId === item.teamId,
  );

  if (actor.globalRole !== "ADMIN" && !isMember) {
    throw new Error("WORK_ITEM_ACCESS_DENIED");
  }

  return prisma.activityEvent.findMany({
    where: { workItemId: item.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      actor: {
        select: { id: true, name: true, email: true },
      },
    },
  });
}

export async function getWorkItemDashboard(actor: AuthenticatedUser) {
  const isAdmin = actor.globalRole === "ADMIN";

  const teamIds = isAdmin
    ? undefined
    : actor.memberships.map((membership) => membership.teamId);

  const leadTeamIds = isAdmin
    ? undefined
    : actor.memberships
        .filter(
          (membership) =>
            membership.role === "LEAD" || membership.role === "ADMIN",
        )
        .map((membership) => membership.teamId);

  const noTeams = teamIds !== undefined && teamIds.length === 0;
  const noLeadTeams = leadTeamIds !== undefined && leadTeamIds.length === 0;

  const itemInclude = {
    team: { select: { id: true, name: true } },
    creator: { select: { id: true, name: true } },
    assignee: { select: { id: true, name: true } },
  } as const;

  const [assignedToMe, unassignedUrgent, awaitingMyApproval] =
    await Promise.all([
      noTeams
        ? Promise.resolve([])
        : prisma.workItem.findMany({
            where: {
              assigneeId: actor.id,
              ...(teamIds ? { teamId: { in: teamIds } } : {}),
              status: { not: "CLOSED" },
            },
            orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
            take: 20,
            include: itemInclude,
          }),

      noTeams
        ? Promise.resolve([])
        : prisma.workItem.findMany({
            where: {
              assigneeId: null,
              priority: "URGENT",
              status: { not: "CLOSED" },
              ...(teamIds ? { teamId: { in: teamIds } } : {}),
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 20,
            include: itemInclude,
          }),

      noLeadTeams
        ? Promise.resolve([])
        : prisma.workItem.findMany({
            where: {
              status: "AWAITING_APPROVAL",
              ...(leadTeamIds ? { teamId: { in: leadTeamIds } } : {}),
            },
            orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
            take: 20,
            include: itemInclude,
          }),
    ]);

  return {
    assignedToMe,
    unassignedUrgent,
    awaitingMyApproval,
  };
}


export async function createWorkItemComment(
  workItemId: string,
  input: CreateWorkItemCommentInput,
  actor: AuthenticatedUser,
) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.workItem.findUnique({
      where: { id: workItemId },
      select: { id: true, teamId: true },
    });

    if (!item) {
      throw new Error("WORK_ITEM_NOT_FOUND");
    }

    const membership = actor.memberships.find(
      (entry) => entry.teamId === item.teamId,
    );

    if (actor.globalRole !== "ADMIN" && !membership) {
      throw new Error("WORK_ITEM_ACCESS_DENIED");
    }

    const comment = await tx.comment.create({
      data: {
        workItemId: item.id,
        authorId: actor.id,
        content: input.content,
      },
      include: {
        author: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    await tx.activityEvent.create({
      data: {
        workItemId: item.id,
        actorId: actor.id,
        action: "COMMENTED",
        details: {
          commentId: comment.id,
        },
      },
    });

    await enqueueOutboxJob(tx, "WORK_ITEM_COMMENTED", {
      workItemId: item.id,
      actorId: actor.id,
      commentId: comment.id,
    });

    return comment;
  });
}

export async function getWorkItemComments(
  workItemId: string,
  actor: AuthenticatedUser,
) {
  const item = await prisma.workItem.findUnique({
    where: { id: workItemId },
    select: { id: true, teamId: true },
  });

  if (!item) {
    throw new Error("WORK_ITEM_NOT_FOUND");
  }

  const hasTeamAccess = actor.memberships.some(
    (membership) => membership.teamId === item.teamId,
  );

  if (actor.globalRole !== "ADMIN" && !hasTeamAccess) {
    throw new Error("WORK_ITEM_ACCESS_DENIED");
  }

  return prisma.comment.findMany({
    where: { workItemId: item.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      author: {
        select: { id: true, name: true, email: true },
      },
    },
  });
}
