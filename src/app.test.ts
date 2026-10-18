import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "./app";
import { prisma } from "./lib/prisma";

const DEMO_PASSWORD = "Demo@12345";

async function login(email: string) {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email, password: DEMO_PASSWORD });

  expect(response.status).toBe(200);
  return response.body.data.accessToken as string;
}

describe("GET /api/health", () => {
  it("returns a successful health-check response", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Newtonite Ops API is running",
    });
  });
});

describe("POST /api/auth/login", () => {
  it("returns 400 when credentials are missing", async () => {
    const response = await request(app).post("/api/auth/login").send({});

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("returns 401 for incorrect credentials", async () => {
    const response = await request(app).post("/api/auth/login").send({
      email: "admin@newtonite.local",
      password: "WrongPassword123!",
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid email or password.");
  });

  it("returns a bearer token for valid credentials", async () => {
    const response = await request(app).post("/api/auth/login").send({
      email: "admin@newtonite.local",
      password: DEMO_PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.tokenType).toBe("Bearer");
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.user.email).toBe("admin@newtonite.local");
    expect(response.body.data.user.teams).toBeInstanceOf(Array);
  });
});

describe("Work-item authorization", () => {
  it("rejects unauthenticated work-item requests", async () => {
    const response = await request(app).get("/api/work-items");

    expect(response.status).toBe(401);
  });

  it("prevents a Viewer from creating work items", async () => {
    const viewerToken = await login("viewer@newtonite.local");

    const team = await prisma.team.findUniqueOrThrow({
      where: { name: "Engineering" },
    });

    const response = await request(app)
      .post("/api/work-items")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({
        title: "Automated viewer permission test",
        type: "TASK",
        priority: "LOW",
        teamId: team.id,
      });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("CREATE_PERMISSION_DENIED");
  });

  it("prevents a Viewer from changing work-item status", async () => {
    const viewerToken = await login("viewer@newtonite.local");

    const team = await prisma.team.findUniqueOrThrow({
      where: { name: "Engineering" },
    });

    const member = await prisma.user.findUniqueOrThrow({
      where: { email: "member@newtonite.local" },
      select: { id: true },
    });

    const item = await prisma.workItem.create({
      data: {
        title: "Automated Viewer status permission test",
        type: "TASK",
        priority: "LOW",
        status: "OPEN",
        version: 1,
        teamId: team.id,
        creatorId: member.id,
      },
    });

    try {
      const response = await request(app)
        .patch(`/api/work-items/${item.id}/status`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({
          status: "IN_PROGRESS",
          version: 1,
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe("WORK_ITEM_PERMISSION_DENIED");

      const unchangedItem = await prisma.workItem.findUniqueOrThrow({
        where: { id: item.id },
        select: { status: true, version: true },
      });

      expect(unchangedItem.status).toBe("OPEN");
      expect(unchangedItem.version).toBe(1);
    } finally {
      await prisma.workItem.delete({
        where: { id: item.id },
      });
    }
  });

  it("prevents a Product member from viewing Engineering activity", async () => {
    const productToken = await login("productmember@newtonite.local");

    const engineeringItemId = "9a339589-58ed-4c55-8000-53401754fc2d";

    const response = await request(app)
      .get(`/api/work-items/${engineeringItemId}/activity`)
      .set("Authorization", `Bearer ${productToken}`);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("WORK_ITEM_ACCESS_DENIED");
  });

  it("prevents a regular member from approving a work item", async () => {
    const memberToken = await login("member@newtonite.local");

    const team = await prisma.team.findUniqueOrThrow({
      where: { name: "Engineering" },
    });

    const item = await prisma.workItem.create({
      data: {
        title: "Automated approval permission test",
        description: "Temporary test item",
        type: "TASK",
        priority: "MEDIUM",
        status: "AWAITING_APPROVAL",
        version: 1,
        teamId: team.id,
        creatorId: (
          await prisma.user.findUniqueOrThrow({
            where: { email: "member@newtonite.local" },
            select: { id: true },
          })
        ).id,
      },
    });

    try {
      const response = await request(app)
        .patch(`/api/work-items/${item.id}/status`)
        .set("Authorization", `Bearer ${memberToken}`)
        .send({
          status: "RESOLVED",
          version: 1,
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe("LEAD_APPROVAL_REQUIRED");
    } finally {
      await prisma.workItem.delete({
        where: { id: item.id },
      });
    }
  });

  it("allows a regular member to close a resolved work item", async () => {
    const memberToken = await login("member@newtonite.local");

    const team = await prisma.team.findUniqueOrThrow({
      where: { name: "Engineering" },
    });

    const member = await prisma.user.findUniqueOrThrow({
      where: { email: "member@newtonite.local" },
      select: { id: true },
    });

    const item = await prisma.workItem.create({
      data: {
        title: "Automated close permission test",
        status: "RESOLVED",
        version: 1,
        teamId: team.id,
        creatorId: member.id,
      },
    });

    try {
      const response = await request(app)
        .patch(`/api/work-items/${item.id}/status`)
        .set("Authorization", `Bearer ${memberToken}`)
        .send({
          status: "CLOSED",
          version: 1,
        });

      expect(response.status).toBe(200);
    } finally {
      await prisma.workItem.delete({
        where: { id: item.id },
      });
    }
  });

  it("allows only one of two concurrent claims to succeed", async () => {
    const memberToken = await login("member@newtonite.local");
    const leadToken = await login("lead@newtonite.local");

    const team = await prisma.team.findUniqueOrThrow({
      where: { name: "Engineering" },
    });

    const member = await prisma.user.findUniqueOrThrow({
      where: { email: "member@newtonite.local" },
      select: { id: true },
    });

    const item = await prisma.workItem.create({
      data: {
        title: "Concurrent claim integration test",
        type: "TASK",
        priority: "HIGH",
        status: "OPEN",
        version: 1,
        teamId: team.id,
        creatorId: member.id,
      },
    });

    try {
      // Send both requests without awaiting either first.
      const responses = await Promise.all([
        request(app)
          .post(`/api/work-items/${item.id}/claim`)
          .set("Authorization", `Bearer ${memberToken}`),
        request(app)
          .post(`/api/work-items/${item.id}/claim`)
          .set("Authorization", `Bearer ${leadToken}`),
      ]);

      const successful = responses.filter((r) => r.status === 200);
      const rejected = responses.filter((r) => r.status !== 200);

      expect(successful).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect([409]).toContain(rejected[0].status);

      const savedItem = await prisma.workItem.findUniqueOrThrow({
        where: { id: item.id },
        select: { assigneeId: true, version: true },
      });

      expect([
        member.id,
        (
          await prisma.user.findUniqueOrThrow({
            where: { email: "lead@newtonite.local" },
            select: { id: true },
          })
        ).id,
      ]).toContain(savedItem.assigneeId);

      expect(savedItem.version).toBe(2);

      const claimEvents = await prisma.activityEvent.count({
        where: {
          workItemId: item.id,
          action: "CLAIMED",
        },
      });

      expect(claimEvents).toBe(1);
    } finally {
      await prisma.activityEvent.deleteMany({
        where: { workItemId: item.id },
      });
      await prisma.workItem.delete({
        where: { id: item.id },
      });
    }
  });

  it("rejects an invalid work-item status transition", async () => {
    const memberToken = await login("member@newtonite.local");

    const team = await prisma.team.findUniqueOrThrow({
      where: { name: "Engineering" },
    });

    const member = await prisma.user.findUniqueOrThrow({
      where: { email: "member@newtonite.local" },
      select: { id: true },
    });

    const item = await prisma.workItem.create({
      data: {
        title: "Invalid transition integration test",
        type: "TASK",
        priority: "HIGH",
        status: "OPEN",
        version: 1,
        teamId: team.id,
        creatorId: member.id,
      },
    });

    try {
      const response = await request(app)
        .patch(`/api/work-items/${item.id}/status`)
        .set("Authorization", `Bearer ${memberToken}`)
        .send({ status: "CLOSED", version: 1 });

      expect(response.status).toBe(409);
      expect(response.body.message).toBe("INVALID_STATUS_TRANSITION");

      const savedItem = await prisma.workItem.findUniqueOrThrow({
        where: { id: item.id },
        select: { status: true, version: true },
      });

      expect(savedItem.status).toBe("OPEN");
      expect(savedItem.version).toBe(1);
    } finally {
      await prisma.activityEvent.deleteMany({
        where: { workItemId: item.id },
      });
      await prisma.workItem.delete({ where: { id: item.id } });
    }
  });

  it("returns the same work item for a duplicate idempotency key", async () => {
    const token = await login("member@newtonite.local");
    const team = await prisma.team.findUniqueOrThrow({
      where: { name: "Engineering" },
    });

    const payload = {
      title: "Idempotency integration test",
      type: "TASK",
      priority: "HIGH",
      teamId: team.id,
    };

    const key = `test-${crypto.randomUUID()}`;

    const first = await request(app)
      .post("/api/work-items")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send(payload);

    const second = await request(app)
      .post("/api/work-items")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);

    await prisma.activityEvent.deleteMany({
      where: { workItemId: first.body.data.id },
    });
    await prisma.idempotencyRecord.deleteMany({
      where: { key },
    });
    await prisma.workItem.delete({
      where: { id: first.body.data.id },
    });
  });

  it("rejects a reused idempotency key with a different payload", async () => {
    const token = await login("member@newtonite.local");
    const team = await prisma.team.findUniqueOrThrow({
      where: { name: "Engineering" },
    });

    const key = `test-${crypto.randomUUID()}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": key,
    };

    const first = await request(app).post("/api/work-items").set(headers).send({
      title: "First idempotency payload",
      type: "TASK",
      priority: "HIGH",
      teamId: team.id,
    });

    const second = await request(app)
      .post("/api/work-items")
      .set(headers)
      .send({
        title: "Different idempotency payload",
        type: "TASK",
        priority: "HIGH",
        teamId: team.id,
      });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.message).toBe("IDEMPOTENCY_KEY_REUSED");

    await prisma.activityEvent.deleteMany({
      where: { workItemId: first.body.data.id },
    });
    await prisma.idempotencyRecord.deleteMany({
      where: { key },
    });
    await prisma.workItem.delete({
      where: { id: first.body.data.id },
    });
  });
});

describe("PATCH /api/work-items/:id", () => {
  async function createTestItem() {
    const team = await prisma.team.findUniqueOrThrow({
      where: { name: "Engineering" },
    });

    const member = await prisma.user.findUniqueOrThrow({
      where: { email: "member@newtonite.local" },
      select: { id: true },
    });

    return prisma.workItem.create({
      data: {
        title: "Automated edit test item",
        description: "Original description",
        type: "TASK",
        priority: "MEDIUM",
        status: "OPEN",
        version: 1,
        teamId: team.id,
        creatorId: member.id,
      },
    });
  }

  async function cleanupTestItem(itemId: string) {
    await prisma.activityEvent.deleteMany({
      where: { workItemId: itemId },
    });

    await prisma.workItem.deleteMany({
      where: { id: itemId },
    });
  }

  it("allows a team Member to edit a work item", async () => {
    const token = await login("member@newtonite.local");
    const item = await createTestItem();

    try {
      const response = await request(app)
        .patch(`/api/work-items/${item.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Updated title from integration test",
          version: 1,
        });

      expect(response.status).toBe(200);

      const savedItem = await prisma.workItem.findUniqueOrThrow({
        where: { id: item.id },
      });

      expect(savedItem.title).toBe("Updated title from integration test");
      expect(savedItem.version).toBe(2);
    } finally {
      await cleanupTestItem(item.id);
    }
  });

  it("rejects an edit using a stale version", async () => {
    const token = await login("member@newtonite.local");
    const item = await createTestItem();

    try {
      const response = await request(app)
        .patch(`/api/work-items/${item.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Stale update",
          version: 99,
        });

      expect(response.status).toBe(409);
      expect(response.body.message).toBe("VERSION_CONFLICT");

      const savedItem = await prisma.workItem.findUniqueOrThrow({
        where: { id: item.id },
      });

      expect(savedItem.title).toBe("Automated edit test item");
      expect(savedItem.version).toBe(1);
    } finally {
      await cleanupTestItem(item.id);
    }
  });

  it("prevents a Viewer from editing a work item", async () => {
    const token = await login("viewer@newtonite.local");
    const item = await createTestItem();

    try {
      const response = await request(app)
        .patch(`/api/work-items/${item.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Viewer must not edit this",
          version: 1,
        });

      expect(response.status).toBe(403);

      const savedItem = await prisma.workItem.findUniqueOrThrow({
        where: { id: item.id },
      });

      expect(savedItem.title).toBe("Automated edit test item");
      expect(savedItem.version).toBe(1);
    } finally {
      await cleanupTestItem(item.id);
    }
  });

  it("rejects assigning an item to a user outside its team", async () => {
    const token = await login("member@newtonite.local");
    const item = await createTestItem();

    const productMember = await prisma.user.findUniqueOrThrow({
      where: { email: "productmember@newtonite.local" },
      select: { id: true },
    });

    try {
      const response = await request(app)
        .patch(`/api/work-items/${item.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          assigneeId: productMember.id,
          version: 1,
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("ASSIGNEE_NOT_IN_TEAM");

      const savedItem = await prisma.workItem.findUniqueOrThrow({
        where: { id: item.id },
      });

      expect(savedItem.assigneeId).toBeNull();
      expect(savedItem.version).toBe(1);
    } finally {
      await cleanupTestItem(item.id);
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
