import "dotenv/config";
import { prisma } from "../../lib/prisma";
import { processOutboxBatch } from "./outbox.service";

const POLL_INTERVAL_MS = 1000;
let stopping = false;

async function sleep(ms: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("Newtonite outbox worker started.");

  while (!stopping) {
    try {
      const result = await processOutboxBatch(10);

      if (result.processed || result.retried || result.failed) {
        console.log("Outbox batch:", result);
      }
    } catch (error) {
      console.error("Outbox batch failed:", error);
    }

    if (!stopping) {
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

function shutdown() {
  stopping = true;
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main()
  .catch((error) => {
    console.error("Outbox worker stopped unexpectedly:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
