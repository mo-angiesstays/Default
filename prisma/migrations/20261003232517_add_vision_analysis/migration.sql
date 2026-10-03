-- CreateEnum
CREATE TYPE "AnalysisKind" AS ENUM ('ISSUE_TRIAGE', 'TURNOVER_CHECK', 'WALKTHROUGH');

-- CreateTable
CREATE TABLE "VisionAnalysis" (
    "id" TEXT NOT NULL,
    "kind" "AnalysisKind" NOT NULL,
    "propertyId" TEXT,
    "issueId" TEXT,
    "taskId" TEXT,
    "mediaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "result" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "frameCount" INTEGER,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisionAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisionAnalysis_issueId_idx" ON "VisionAnalysis"("issueId");

-- CreateIndex
CREATE INDEX "VisionAnalysis_taskId_idx" ON "VisionAnalysis"("taskId");

-- CreateIndex
CREATE INDEX "VisionAnalysis_propertyId_createdAt_idx" ON "VisionAnalysis"("propertyId", "createdAt");

-- AddForeignKey
ALTER TABLE "VisionAnalysis" ADD CONSTRAINT "VisionAnalysis_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionAnalysis" ADD CONSTRAINT "VisionAnalysis_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionAnalysis" ADD CONSTRAINT "VisionAnalysis_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionAnalysis" ADD CONSTRAINT "VisionAnalysis_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
