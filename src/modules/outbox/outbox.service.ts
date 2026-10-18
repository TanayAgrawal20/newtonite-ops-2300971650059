import type { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

export type OutboxPayload = {
  workItemId: string;
  actorId: string;
  version?: number;
  commentId?: string;
};

export async function enqueueOutboxJob(
  tx: Prisma.TransactionClient,
  eventType: string,
  payload: OutboxPayload,
) {
  return tx.outboxJob.create({
    data: {
      eventType,
      payload,
      status: "PENDING",
      maxAttempts: 5,
      availableAt: new Date(),
    },
  });
}

export async function processOutboxBatch(batchSize = 10) {
  const safeBatchSize = Math.max(1, Math.min(Math.floor(batchSize), 100));
  const now = new Date();

  // Recover jobs whose worker lock expired after a crash.
  const staleLockTime = new Date(Date.now() - 5 * 60 * 1000);

  await prisma.outboxJob.updateMany({
    where: {
      status: "PROCESSING",
      lockedAt: { lte: staleLockTime },
    },
    data: {
      status: "PENDING",
      lockedAt: null,
      availableAt: now,
      lastError: "Recovered expired worker lock",
    },
  });

  const jobs = await prisma.outboxJob.findMany({
    where: {
      status: "PENDING",
      availableAt: { lte: now },
      attempts: { lt: 5 },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: safeBatchSize,
  });

  let processed = 0;
  let retried = 0;
  let failed = 0;

  for (const job of jobs) {
    // Atomic claim: only one worker can claim a pending job.
    const claimed = await prisma.outboxJob.updateMany({
      where: {
        id: job.id,
        status: "PENDING",
        availableAt: { lte: new Date() },
        attempts: { lt: job.maxAttempts },
      },
      data: {
        status: "PROCESSING",
        lockedAt: new Date(),
        attempts: { increment: 1 },
      },
    });

    if (claimed.count !== 1) continue;

    try {
      // Validate the event instead of silently completing unknown events.
      const supportedEvents = new Set([
        "WORK_ITEM_CREATED",
        "WORK_ITEM_STATUS_CHANGED",
        "WORK_ITEM_CLAIMED",
        "WORK_ITEM_UPDATED",
        "WORK_ITEM_COMMENTED",
      ]);

      if (!supportedEvents.has(job.eventType)) {
        throw new Error(`Unsupported outbox event: ${job.eventType}`);
      }

      const payload = job.payload as unknown as OutboxPayload;

      if (
        typeof payload.workItemId !== "string" ||
        typeof payload.actorId !== "string"
      ) {
        throw new Error("Invalid outbox payload");
      }

      if (
        job.eventType === "WORK_ITEM_COMMENTED" &&
        typeof payload.commentId !== "string"
      ) {
        throw new Error("Comment outbox event requires commentId");
      }

      if (
        job.eventType !== "WORK_ITEM_COMMENTED" &&
        typeof payload.version !== "number"
      ) {
        throw new Error("Work-item outbox event requires version");
      }

      // Confirm that the event's referenced records still exist.
      // Processing is intentionally read-only and safe to repeat.
      const [workItem, actor] = await Promise.all([
        prisma.workItem.findUnique({
          where: { id: payload.workItemId },
          select: { id: true },
        }),
        prisma.user.findUnique({
          where: { id: payload.actorId },
          select: { id: true },
        }),
      ]);

      if (job.eventType === "WORK_ITEM_COMMENTED") {
        const comment = await prisma.comment.findUnique({
          where: { id: payload.commentId! },
          select: { id: true, workItemId: true, authorId: true },
        });

        if (
          !comment ||
          comment.workItemId !== payload.workItemId ||
          comment.authorId !== payload.actorId
        ) {
          throw new Error("Comment outbox event references an invalid comment");
        }
      }

      if (!workItem || !actor) {
        throw new Error("Outbox event references a missing work item or actor");
      }

      await prisma.outboxJob.updateMany({
        where: {
          id: job.id,
          status: "PROCESSING",
        },
        data: {
          status: "COMPLETED",
          processedAt: new Date(),
          lockedAt: null,
          lastError: null,
        },
      });

      processed++;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown worker error";

      // The claim incremented attempts in the database.
      const attempts = job.attempts + 1;
      const isFinalAttempt = attempts >= job.maxAttempts;

      await prisma.outboxJob.updateMany({
        where: {
          id: job.id,
          status: "PROCESSING",
        },
        data: {
          status: isFinalAttempt ? "FAILED" : "PENDING",
          lockedAt: null,
          availableAt: new Date(
            Date.now() + Math.min(60_000, 1_000 * 2 ** attempts),
          ),
          lastError: message.slice(0, 2000),
        },
      });

      if (isFinalAttempt) {
        failed++;
      } else {
        retried++;
      }
    }
  }

  return { processed, retried, failed };
}
