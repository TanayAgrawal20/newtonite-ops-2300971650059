import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash("Demo@12345", 12);

  const teamDefinitions = [
    {
      name: "Engineering",
      description: "Software engineering and development",
    },
    {
      name: "Operations",
      description: "Internal operations and incident management",
    },
    {
      name: "Product",
      description: "Product planning and delivery",
    },
  ];

  const teams = [];

  for (const definition of teamDefinitions) {
    const team = await prisma.team.upsert({
      where: { name: definition.name },
      update: { description: definition.description },
      create: definition,
    });

    teams.push(team);
  }

  const userDefinitions = [
    {
      name: "System Admin",
      email: "admin@newtonite.local",
      globalRole: "ADMIN" as const,
      teamIndex: 0,
      teamRole: "LEAD" as const,
    },
    {
      name: "Engineering Lead",
      email: "lead@newtonite.local",
      globalRole: "USER" as const,
      teamIndex: 0,
      teamRole: "LEAD" as const,
    },
    {
      name: "Engineering Member",
      email: "member@newtonite.local",
      globalRole: "USER" as const,
      teamIndex: 0,
      teamRole: "MEMBER" as const,
    },
    {
      name: "Engineering Viewer",
      email: "viewer@newtonite.local",
      globalRole: "USER" as const,
      teamIndex: 0,
      teamRole: "VIEWER" as const,
    },
    {
      name: "Operations Lead",
      email: "opslead@newtonite.local",
      globalRole: "USER" as const,
      teamIndex: 1,
      teamRole: "LEAD" as const,
    },
    {
      name: "Operations Member",
      email: "opsmember@newtonite.local",
      globalRole: "USER" as const,
      teamIndex: 1,
      teamRole: "MEMBER" as const,
    },
    {
      name: "Product Lead",
      email: "productlead@newtonite.local",
      globalRole: "USER" as const,
      teamIndex: 2,
      teamRole: "LEAD" as const,
    },
    {
      name: "Product Member",
      email: "productmember@newtonite.local",
      globalRole: "USER" as const,
      teamIndex: 2,
      teamRole: "MEMBER" as const,
    },
    {
      name: "Engineering Team Admin",
      email: "engadmin@newtonite.local",
      globalRole: "USER" as const,
      teamIndex: 0,
      teamRole: "ADMIN" as const,
    },
  ];

  for (const definition of userDefinitions) {
    const user = await prisma.user.upsert({
      where: { email: definition.email },
      update: {
        name: definition.name,
        passwordHash,
        globalRole: definition.globalRole,
      },
      create: {
        name: definition.name,
        email: definition.email,
        passwordHash,
        globalRole: definition.globalRole,
      },
    });

    await prisma.teamMember.upsert({
      where: {
        userId_teamId: {
          userId: user.id,
          teamId: teams[definition.teamIndex].id,
        },
      },
      update: { role: definition.teamRole },
      create: {
        userId: user.id,
        teamId: teams[definition.teamIndex].id,
        role: definition.teamRole,
      },
    });
  }

  console.log("Database seed completed.");
  console.log("Demo password for all seeded users: Demo@12345");
  console.log("Demo admin email: admin@newtonite.local");
}

main()
  .catch((error) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
