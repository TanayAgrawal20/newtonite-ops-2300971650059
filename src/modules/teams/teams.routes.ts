import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const auth = authenticatedReq.auth;

    if (!auth) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const isAdmin = auth.globalRole === "ADMIN";
    const memberships = auth.memberships ?? [];
    const allowedTeamIds = memberships.map((membership) => membership.teamId);

    const teams = await prisma.team.findMany({
      where: isAdmin ? {} : { id: { in: allowedTeamIds } },
      select: {
        id: true,
        name: true,
        description: true,
      },
      orderBy: { name: "asc" },
    });

    return res.status(200).json({
      success: true,
      data: teams,
    });
  } catch (error) {
    console.error("Failed to list teams:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load teams",
    });
  }
});

export default router;
