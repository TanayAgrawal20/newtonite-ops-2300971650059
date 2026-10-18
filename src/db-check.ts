
import { prisma } from "./lib/prisma";

async function main() {
  await prisma.$connect();

  const result = await prisma.$queryRaw<
    Array<{ current_database: string; current_user: string }>
  >`SELECT current_database(), current_user`;

  console.log("Database connection successful!");
  console.log("Database:", result[0].current_database);
  console.log("User:", result[0].current_user);
}

main()
  .catch((error) => {
    console.error("Database connection failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
