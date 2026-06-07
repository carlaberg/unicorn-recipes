-- AlterTable
ALTER TABLE "WeeklyMenu"
  ADD COLUMN "isTemplate" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ShoppingCheck" (
  "id" SERIAL NOT NULL,
  "weeklyMenuId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "ingredientKey" TEXT NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ShoppingCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingCheck_weeklyMenuId_userId_ingredientKey_key"
ON "ShoppingCheck"("weeklyMenuId", "userId", "ingredientKey");

-- AddForeignKey
ALTER TABLE "ShoppingCheck"
  ADD CONSTRAINT "ShoppingCheck_weeklyMenuId_fkey"
  FOREIGN KEY ("weeklyMenuId") REFERENCES "WeeklyMenu"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingCheck"
  ADD CONSTRAINT "ShoppingCheck_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
