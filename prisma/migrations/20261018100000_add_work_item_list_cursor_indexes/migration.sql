-- DropIndex
DROP INDEX "WorkItem_teamId_createdAt_idx";

-- CreateIndex
CREATE INDEX "WorkItem_teamId_createdAt_id_idx" ON "WorkItem"("teamId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "WorkItem_createdAt_id_idx" ON "WorkItem"("createdAt", "id");
