
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { prisma } from "./lib/prisma";
import authRoutes from "./modules/auth/auth.routes";
import { requireAuth } from "./middleware/auth.middleware";
import type { AuthenticatedRequest } from "./middleware/auth.middleware";
import workItemRoutes from "./modules/work-items/work-items.routes";
import teamRoutes from "./modules/teams/teams.routes";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use("/api/teams", teamRoutes);

app.get("/api/auth/me", requireAuth, (req, res) => {
  const authenticatedReq = req as AuthenticatedRequest;

  res.status(200).json({
    success: true,
    data: authenticatedReq.auth,
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/work-items", workItemRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Newtonite Ops API is running",
  });
});

// Database health check
app.get("/api/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      message: "PostgreSQL connection is healthy",
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    res.status(503).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

// Handle unknown routes
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

export default app;