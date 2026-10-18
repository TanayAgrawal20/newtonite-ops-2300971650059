import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    outboxJob: {
      findMany: mocks.findMany,
      updateMany: mocks.updateMany,
      update: mocks.update,
    },
    workItem: {
      findUnique: mocks.findUnique,
    },
    user: {
      findUnique: mocks.findUnique,
    },
  },
}));

import { processOutboxBatch } from "./outbox.service";

describe("processOutboxBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findUnique.mockResolvedValue({ id: "record-1" });
  });

  it("returns zero counts when no jobs are available", async () => {
    mocks.findMany.mockResolvedValue([]);

    await expect(processOutboxBatch()).resolves.toEqual({
      processed: 0,
      retried: 0,
      failed: 0,
    });
  });

  it("completes a valid job", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "job-1",
        eventType: "WORK_ITEM_CREATED",
        payload: {
          workItemId: "item-1",
          actorId: "actor-1",
          version: 1,
        },
        attempts: 0,
        maxAttempts: 5,
      },
    ]);

    await expect(processOutboxBatch()).resolves.toEqual({
      processed: 1,
      retried: 0,
      failed: 0,
    });

    expect(mocks.updateMany).toHaveBeenCalledTimes(3);
    expect(mocks.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "job-1", status: "PROCESSING" },
        data: expect.objectContaining({
          status: "COMPLETED",
          processedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("rejects unsupported events and schedules a retry", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "job-2",
        eventType: "UNKNOWN_EVENT",
        payload: {
          workItemId: "item-1",
          actorId: "actor-1",
          version: 1,
        },
        attempts: 0,
        maxAttempts: 5,
      },
    ]);

    await expect(processOutboxBatch()).resolves.toEqual({
      processed: 0,
      retried: 1,
      failed: 0,
    });

    expect(mocks.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "job-2", status: "PROCESSING" },
        data: expect.objectContaining({
          status: "PENDING",
          lockedAt: null,
          lastError: expect.stringContaining("Unsupported outbox event"),
        }),
      }),
    );
  });

  it("marks a job FAILED on its final attempt", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "job-3",
        eventType: "UNKNOWN_EVENT",
        payload: {
          workItemId: "item-1",
          actorId: "actor-1",
          version: 1,
        },
        attempts: 4,
        maxAttempts: 5,
      },
    ]);

    await expect(processOutboxBatch()).resolves.toEqual({
      processed: 0,
      retried: 0,
      failed: 1,
    });

    expect(mocks.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "job-3", status: "PROCESSING" },
        data: expect.objectContaining({
          status: "FAILED",
          lockedAt: null,
        }),
      }),
    );
  });

  it("recovers jobs with expired processing locks", async () => {
    mocks.findMany.mockResolvedValue([]);

    await processOutboxBatch();

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PROCESSING",
          lockedAt: expect.objectContaining({ lte: expect.any(Date) }),
        }),
        data: expect.objectContaining({
          status: "PENDING",
          lockedAt: null,
          lastError: "Recovered expired worker lock",
        }),
      }),
    );
  });
});
