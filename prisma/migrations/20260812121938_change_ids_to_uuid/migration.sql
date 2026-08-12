/*
  Warnings:

  - Made the column `user_id` on table `devices` required. This step will fail if there are existing NULL values in that column.
  - Made the column `user_id` on table `otp_verifications` required. This step will fail if there are existing NULL values in that column.
  - Made the column `reminder_id` on table `push_notification_settings` required. This step will fail if there are existing NULL values in that column.
  - Made the column `device_id` on table `refresh_tokens` required. This step will fail if there are existing NULL values in that column.
  - Made the column `reminder_id` on table `reminder_history` required. This step will fail if there are existing NULL values in that column.
  - Made the column `user_id` on table `reminders` required. This step will fail if there are existing NULL values in that column.
  - Made the column `user_id` on table `silent_hours` required. This step will fail if there are existing NULL values in that column.
  - Made the column `user_id` on table `user_settings` required. This step will fail if there are existing NULL values in that column.
  - Made the column `language_id` on table `user_settings` required. This step will fail if there are existing NULL values in that column.
  - Made the column `reminder_id` on table `voice_call_settings` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "devices" ALTER COLUMN "user_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "otp_verifications" ALTER COLUMN "user_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "push_notification_settings" ALTER COLUMN "reminder_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "refresh_tokens" ALTER COLUMN "device_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "reminder_history" ALTER COLUMN "reminder_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "reminders" ALTER COLUMN "user_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "silent_hours" ALTER COLUMN "user_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "user_settings" ALTER COLUMN "user_id" SET NOT NULL,
ALTER COLUMN "language_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "voice_call_settings" ALTER COLUMN "reminder_id" SET NOT NULL;
