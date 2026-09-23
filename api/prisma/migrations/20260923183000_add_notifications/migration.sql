CREATE TYPE "NotificationDeliveryMethod" AS ENUM ('CALENDAR', 'SMS', 'APP');

CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "repeatsWeekly" BOOLEAN NOT NULL DEFAULT false,
    "deliveryMethods" "NotificationDeliveryMethod"[] DEFAULT ARRAY[]::"NotificationDeliveryMethod"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX "Notification_userId_date_idx" ON "Notification"("userId", "date");

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
