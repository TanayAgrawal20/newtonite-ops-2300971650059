import { z } from "zod";

const cursorPayloadSchema = z
  .object({
    createdAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
  })
  .strict();

export type WorkItemCursor = {
  createdAt: Date;
  id: string;
};

export function encodeWorkItemCursor(createdAt: Date, id: string): string {
  const payload = JSON.stringify({
    createdAt: createdAt.toISOString(),
    id,
  });

  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeWorkItemCursor(cursor: string): WorkItemCursor {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = cursorPayloadSchema.parse(JSON.parse(decoded));
    const createdAt = new Date(parsed.createdAt);

    if (Number.isNaN(createdAt.getTime())) {
      throw new Error("INVALID_CURSOR");
    }

    return {
      createdAt,
      id: parsed.id,
    };
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}
