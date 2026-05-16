-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('LUNCH', 'DINNER');

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "dummy" TEXT;
ALTER TABLE "Recipe" DROP COLUMN IF EXISTS "dummy";

-- CreateTable
CREATE TABLE "WeeklyMenu" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT,
    "startDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyMenu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuEntry" (
    "id" SERIAL NOT NULL,
    "weeklyMenuId" INTEGER NOT NULL,
    "dayOffset" INTEGER NOT NULL,
    "mealType" "MealType" NOT NULL,
    "recipeId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MenuEntry_weeklyMenuId_dayOffset_mealType_key" ON "MenuEntry"("weeklyMenuId", "dayOffset", "mealType");

-- AddForeignKey
ALTER TABLE "WeeklyMenu" ADD CONSTRAINT "WeeklyMenu_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuEntry" ADD CONSTRAINT "MenuEntry_weeklyMenuId_fkey" FOREIGN KEY ("weeklyMenuId") REFERENCES "WeeklyMenu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuEntry" ADD CONSTRAINT "MenuEntry_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
