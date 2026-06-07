-- DropForeignKey
ALTER TABLE "MenuEntry" DROP CONSTRAINT "MenuEntry_recipeId_fkey";

-- AddForeignKey
ALTER TABLE "MenuEntry" ADD CONSTRAINT "MenuEntry_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
