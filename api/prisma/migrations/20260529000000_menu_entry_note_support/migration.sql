-- AlterTable
ALTER TABLE "MenuEntry" ALTER COLUMN "recipeId" DROP NOT NULL;
ALTER TABLE "MenuEntry" ADD COLUMN "note" TEXT;
