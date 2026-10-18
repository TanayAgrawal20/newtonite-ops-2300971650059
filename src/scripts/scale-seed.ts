import { createHash } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";

export const SCALE_SEED_NAMESPACE = "newtonite-ops:scale-work-item:v1";
export const DEFAULT_SCALE_ITEM_COUNT = 5000;

const TEAM_NAMES = ["Engineering", "Operations", "Product"] as const;
const TYPES = ["TASK", "BUG", "INCIDENT", "REQUEST"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "AWAITING_APPROVAL",
  "RESOLVED",
  "CLOSED",
] as const;

const BASE_CREATED_AT = Date.parse("2024-01-01T00:00:00.000Z");

export function scaleWorkItemId(index: number): string {
  const hex = createHash("sha256")
    .update(`${SCALE_SEED_NAMESPACE}:${index}`)
    .digest("hex");

  const variantByte = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, "0");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variantByte}${hex.slice(18, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function pickAssignableMembers(
  members: { userId: string; role: string }[],
) {
  return members.filter((member) => member.role !== "VIEWER");
}

export async function seedScaleWorkItems(
  prisma: PrismaClient,
  options: { count?: number } = {},
) {
  const count = options.count ?? DEFAULT_SCALE_ITEM_COUNT;

  const teams = await prisma.team.findMany({
    where: { name: { in: [...TEAM_NAMES] } },
    include: {
      members: {
        select: { userId: true, role: true },
      },
    },
    orderBy: { name: "asc" },
  });

  if (teams.length !== TEAM_NAMES.length) {
    throw new Error(
      "Scale seed requires the demo teams from `npx prisma db seed`. Missing Engineering, Operations, or Product.",
    );
  }

  const teamPlans = teams.map((team) => {
    const assignable = pickAssignableMembers(team.members);

    if (assignable.length === 0) {
      throw new Error(
        `Scale seed requires at least one non-viewer member on team ${team.name}.`,
      );
    }

    return {
      teamId: team.id,
      assignable,
    };
  });

  const records = Array.from({ length: count }, (_, index) => {
    const team = teamPlans[index % teamPlans.length];
    const creator =
      team.assignable[index % team.assignable.length];
    const status = STATUSES[index % STATUSES.length];
    const shouldAssign =
      status === "IN_PROGRESS" ||
      status === "AWAITING_APPROVAL" ||
      index % 3 !== 0;
    const assignee = shouldAssign
      ? team.assignable[(index + 1) % team.assignable.length]
      : null;
    const createdAt = new Date(
      BASE_CREATED_AT + Math.floor(index / 3) * 1000,
    );
    const dueDate =
      index % 5 === 0
        ? null
        : new Date(createdAt.getTime() + (index % 14) * 24 * 60 * 60 * 1000);

    return {
      id: scaleWorkItemId(index),
      title: `SCALE ${String(index + 1).padStart(4, "0")} ${TYPES[index % TYPES.length]} work item`,
      description: `Deterministic scale-seed record ${index + 1} (${SCALE_SEED_NAMESPACE}).`,
      type: TYPES[index % TYPES.length],
      priority: PRIORITIES[index % PRIORITIES.length],
      status,
      teamId: team.teamId,
      creatorId: creator.userId,
      assigneeId: assignee?.userId ?? null,
      dueDate,
      version: 1,
      createdAt,
      updatedAt: createdAt,
    };
  });

  let inserted = 0;
  const batchSize = 500;

  for (let start = 0; start < records.length; start += batchSize) {
    const batch = records.slice(start, start + batchSize);
    const result = await prisma.workItem.createMany({
      data: batch,
      skipDuplicates: true,
    });
    inserted += result.count;
  }

  const reused = count - inserted;

  return {
    requested: count,
    inserted,
    reused,
  };
}
