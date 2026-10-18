import type { Request, Response, NextFunction } from "express";

import { prisma } from "../lib/prisma";
import { verifyAccessToken } from "../modules/auth/auth.token";

export type AuthenticatedUser = {
  id: string;
  email: string;
  globalRole: "ADMIN" | "USER";
  memberships: {
    teamId: string;
    role: "VIEWER" | "MEMBER" | "LEAD" | "ADMIN";
  }[];
};

export type AuthenticatedRequest = Request & {
  auth?: AuthenticatedUser;
};

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "Authentication token is required.",
      });
      return;
    }

    const token = authorization.slice("Bearer ".length);
    const payload = verifyAccessToken(token);

    // Load current user and team memberships from the database.
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        globalRole: true,
        memberships: {
          select: {
            teamId: true,
            role: true,
          },
        },
      },
    });

    if (!user || user.email !== payload.email) {
      res.status(401).json({
        success: false,
        message: "Invalid authentication credentials.",
      });
      return;
    }

    (req as AuthenticatedRequest).auth = {
      id: user.id,
      email: user.email,
      globalRole: user.globalRole,
      memberships: user.memberships,
    };

    next();
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token.",
    });
  }
}
