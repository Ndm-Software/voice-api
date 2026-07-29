-- CreateEnum
CREATE TYPE "PlatformType" AS ENUM ('WEB', 'ANDROID', 'IOS');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('PHONE_CHANGE', 'PHONE_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "RepeatType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HistoryType" AS ENUM ('PUSH', 'VOICE_CALL');

-- CreateEnum
CREATE TYPE "HistoryStatus" AS ENUM ('SUCCESS', 'FAILED', 'PENDING');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "languages" (
    "language_id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "voice_name" TEXT NOT NULL,

    CONSTRAINT "languages_pkey" PRIMARY KEY ("language_id")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" SERIAL NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "setting_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "language_id" INTEGER NOT NULL,
    "timezone" VARCHAR(100) NOT NULL,
    "province" VARCHAR(100) NOT NULL,
    "notifications_enabled" BOOLEAN NOT NULL,
    "default_push_before" INTEGER NOT NULL,
    "default_call_before" INTEGER NOT NULL,
    "emergency_override" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("setting_id")
);

-- CreateTable
CREATE TABLE "devices" (
    "device_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "platform" "PlatformType" NOT NULL,
    "device_name" VARCHAR(100) NOT NULL,
    "push_token" TEXT NOT NULL,
    "last_active" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("device_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "refresh_token_id" SERIAL NOT NULL,
    "device_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("refresh_token_id")
);

-- CreateTable
CREATE TABLE "otp_verifications" (
    "otp_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "phone_number" VARCHAR(20) NOT NULL,
    "otp_code" VARCHAR(10) NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_verifications_pkey" PRIMARY KEY ("otp_id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "reminder_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "parent_reminder_id" INTEGER,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "event_datetime" TIMESTAMP(3) NOT NULL,
    "repeat_type" "RepeatType" NOT NULL,
    "repeat_until" TIMESTAMP(3),
    "status" "ReminderStatus" NOT NULL,
    "is_urgent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("reminder_id")
);

-- CreateTable
CREATE TABLE "reminder_history" (
    "history_id" SERIAL NOT NULL,
    "reminder_id" INTEGER NOT NULL,
    "historyType" "HistoryType" NOT NULL,
    "status" "HistoryStatus" NOT NULL,
    "provider" VARCHAR(50),
    "sent_at" TIMESTAMP(3),
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,

    CONSTRAINT "reminder_history_pkey" PRIMARY KEY ("history_id")
);

-- CreateTable
CREATE TABLE "push_notification_settings" (
    "push_id" SERIAL NOT NULL,
    "reminder_id" INTEGER NOT NULL,
    "minutes_before" INTEGER NOT NULL,
    "job_id" VARCHAR(100) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_notification_settings_pkey" PRIMARY KEY ("push_id")
);

-- CreateTable
CREATE TABLE "voice_call_settings" (
    "call_id" SERIAL NOT NULL,
    "reminder_id" INTEGER NOT NULL,
    "minutes_before" INTEGER NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "job_id" VARCHAR(100),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_call_settings_pkey" PRIMARY KEY ("call_id")
);

-- CreateTable
CREATE TABLE "silent_hours" (
    "silent_hour_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "day_of_week" "DayOfWeek" NOT NULL,
    "silent_start" TIME NOT NULL,
    "silent_end" TIME NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "silent_hours_pkey" PRIMARY KEY ("silent_hour_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "languages_code_key" ON "languages"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_user_id_key" ON "user_settings"("user_id");

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("language_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("device_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_verifications" ADD CONSTRAINT "otp_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_parent_reminder_id_fkey" FOREIGN KEY ("parent_reminder_id") REFERENCES "reminders"("reminder_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_history" ADD CONSTRAINT "reminder_history_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "reminders"("reminder_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_notification_settings" ADD CONSTRAINT "push_notification_settings_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "reminders"("reminder_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_call_settings" ADD CONSTRAINT "voice_call_settings_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "reminders"("reminder_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "silent_hours" ADD CONSTRAINT "silent_hours_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
