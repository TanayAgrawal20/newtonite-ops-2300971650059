import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import {
  DEFAULT_SCALE_ITEM_COUNT,
  seedScaleWorkItems,
} from "../src/scripts/scale-seed";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const count = Number.parseInt(
    process.env.SCALE_ITEM_COUNT ?? String(DEFAULT_SCALE_ITEM_COUNT),
    10,
  );

  if (!Number.isInteger(count) || count < 1) {
    throw new Error("SCALE_ITEM_COUNT must be a positive integer.");
  }

  const result = await seedScaleWorkItems(prisma, { count });

  console.log("Scale seed completed.");
  console.log(`Requested: ${result.requested}`);
  console.log(`Inserted: ${result.inserted}`);
  console.log(`Reused existing scale records: ${result.reused}`);
}

main()
  .catch((error) => {
    console.error("Scale seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
