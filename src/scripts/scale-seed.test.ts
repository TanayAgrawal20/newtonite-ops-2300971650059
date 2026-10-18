import { describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";
import { scaleWorkItemId, seedScaleWorkItems } from "./scale-seed";

describe("scale seed", () => {
  const count = 25;

  it("can run twice without duplicating generated records", async () => {
    const first = await seedScaleWorkItems(prisma, { count });
    const second = await seedScaleWorkItems(prisma, { count });

    const ids = Array.from({ length: count }, (_, index) =>
      scaleWorkItemId(index),
    );
    const stored = await prisma.workItem.count({
      where: { id: { in: ids } },
    });

    expect(first.requested).toBe(count);
    expect(first.inserted + first.reused).toBe(count);
    expect(second.inserted).toBe(0);
    expect(second.reused).toBe(count);
    expect(stored).toBe(count);
  });
});
