-- CreateIndex
CREATE UNIQUE INDEX "silent_hours_user_id_day_of_week_key"
ON "silent_hours"("user_id", "day_of_week");
