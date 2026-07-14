-- CreateTable
CREATE TABLE "MenuRotation" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "name" TEXT,
  "description" TEXT,
  "startDate" DATE NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "maxCycles" INTEGER,
  "nextWeekIndex" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MenuRotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuRotationTemplate" (
  "id" SERIAL NOT NULL,
  "rotationId" INTEGER NOT NULL,
  "templateMenuId" INTEGER NOT NULL,
  "orderIndex" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MenuRotationTemplate_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "WeeklyMenu"
  ADD COLUMN "rotationId" INTEGER,
  ADD COLUMN "rotationWeekIndex" INTEGER;

-- CreateIndex
CREATE INDEX "MenuRotation_userId_idx" ON "MenuRotation"("userId");
CREATE INDEX "MenuRotation_userId_isActive_idx" ON "MenuRotation"("userId", "isActive");
CREATE UNIQUE INDEX "MenuRotation_userId_active_unique" ON "MenuRotation"("userId") WHERE "isActive" = true;

-- CreateIndex
CREATE UNIQUE INDEX "MenuRotationTemplate_rotationId_orderIndex_key"
ON "MenuRotationTemplate"("rotationId", "orderIndex");

CREATE INDEX "MenuRotationTemplate_rotationId_idx"
ON "MenuRotationTemplate"("rotationId");

CREATE INDEX "MenuRotationTemplate_templateMenuId_idx"
ON "MenuRotationTemplate"("templateMenuId");

CREATE INDEX "WeeklyMenu_rotationId_idx" ON "WeeklyMenu"("rotationId");

-- AddForeignKey
ALTER TABLE "MenuRotation"
  ADD CONSTRAINT "MenuRotation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MenuRotationTemplate"
  ADD CONSTRAINT "MenuRotationTemplate_rotationId_fkey"
  FOREIGN KEY ("rotationId") REFERENCES "MenuRotation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MenuRotationTemplate"
  ADD CONSTRAINT "MenuRotationTemplate_templateMenuId_fkey"
  FOREIGN KEY ("templateMenuId") REFERENCES "WeeklyMenu"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WeeklyMenu"
  ADD CONSTRAINT "WeeklyMenu_rotationId_fkey"
  FOREIGN KEY ("rotationId") REFERENCES "MenuRotation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
