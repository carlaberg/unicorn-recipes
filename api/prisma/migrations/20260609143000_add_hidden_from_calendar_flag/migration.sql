-- Add soft calendar visibility flag for weekly menus.
-- Used to hide future rotation menus when a rotation is deactivated,
-- without deleting any data.
ALTER TABLE "WeeklyMenu"
ADD COLUMN "hiddenFromCalendar" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "WeeklyMenu_userId_hiddenFromCalendar_startDate_idx"
ON "WeeklyMenu"("userId", "hiddenFromCalendar", "startDate");
