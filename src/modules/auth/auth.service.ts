
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";
import { createAccessToken } from "./auth.token";

type LoginInput = {
  email: string;
  password: string;
};

export async function loginUser(input: LoginInput) {
  const email = input.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
      globalRole: true,
      memberships: {
        select: {
          teamId: true,
          role: true,
          team: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(
    input.password,
    user.passwordHash
  );

  if (!passwordMatches) {
    return null;
  }

  const accessToken = createAccessToken({
    sub: user.id,
    email: user.email,
    globalRole: user.globalRole,
  });

  return {
    accessToken,
    tokenType: "Bearer",
    expiresIn: "15m",
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      globalRole: user.globalRole,
      teams: user.memberships.map((membership) => ({
        teamId: membership.teamId,
        teamName: membership.team.name,
        role: membership.role,
      })),
    },
  };
}
