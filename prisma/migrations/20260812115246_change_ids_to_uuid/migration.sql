-- ============================================================
-- Change all primary keys and foreign keys from INTEGER to UUID
-- while preserving existing data and relationships.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Add temporary UUID columns for primary keys
-- ------------------------------------------------------------

ALTER TABLE "users"
ADD COLUMN "user_id_new" UUID;

ALTER TABLE "languages"
ADD COLUMN "language_id_new" UUID;

ALTER TABLE "devices"
ADD COLUMN "device_id_new" UUID;

ALTER TABLE "user_settings"
ADD COLUMN "setting_id_new" UUID;

ALTER TABLE "refresh_tokens"
ADD COLUMN "refresh_token_id_new" UUID;

ALTER TABLE "otp_verifications"
ADD COLUMN "otp_id_new" UUID;

ALTER TABLE "reminders"
ADD COLUMN "reminder_id_new" UUID;

ALTER TABLE "reminder_history"
ADD COLUMN "history_id_new" UUID;

ALTER TABLE "push_notification_settings"
ADD COLUMN "push_id_new" UUID;

ALTER TABLE "voice_call_settings"
ADD COLUMN "call_id_new" UUID;

ALTER TABLE "silent_hours"
ADD COLUMN "silent_hour_id_new" UUID;


-- ------------------------------------------------------------
-- 2. Generate UUID for every existing primary key
-- ------------------------------------------------------------

UPDATE "users"
SET "user_id_new" = gen_random_uuid();

UPDATE "languages"
SET "language_id_new" = gen_random_uuid();

UPDATE "devices"
SET "device_id_new" = gen_random_uuid();

UPDATE "user_settings"
SET "setting_id_new" = gen_random_uuid();

UPDATE "refresh_tokens"
SET "refresh_token_id_new" = gen_random_uuid();

UPDATE "otp_verifications"
SET "otp_id_new" = gen_random_uuid();

UPDATE "reminders"
SET "reminder_id_new" = gen_random_uuid();

UPDATE "reminder_history"
SET "history_id_new" = gen_random_uuid();

UPDATE "push_notification_settings"
SET "push_id_new" = gen_random_uuid();

UPDATE "voice_call_settings"
SET "call_id_new" = gen_random_uuid();

UPDATE "silent_hours"
SET "silent_hour_id_new" = gen_random_uuid();


-- ------------------------------------------------------------
-- 3. Add temporary UUID columns for foreign keys
-- ------------------------------------------------------------

ALTER TABLE "devices"
ADD COLUMN "user_id_new" UUID;

ALTER TABLE "user_settings"
ADD COLUMN "user_id_new" UUID;

ALTER TABLE "user_settings"
ADD COLUMN "language_id_new" UUID;

ALTER TABLE "refresh_tokens"
ADD COLUMN "device_id_new" UUID;

ALTER TABLE "otp_verifications"
ADD COLUMN "user_id_new" UUID;

ALTER TABLE "reminders"
ADD COLUMN "user_id_new" UUID;

ALTER TABLE "reminders"
ADD COLUMN "parent_reminder_id_new" UUID;

ALTER TABLE "reminder_history"
ADD COLUMN "reminder_id_new" UUID;

ALTER TABLE "push_notification_settings"
ADD COLUMN "reminder_id_new" UUID;

ALTER TABLE "voice_call_settings"
ADD COLUMN "reminder_id_new" UUID;

ALTER TABLE "silent_hours"
ADD COLUMN "user_id_new" UUID;


-- ------------------------------------------------------------
-- 4. Convert foreign keys using the old ID -> new UUID mapping
-- ------------------------------------------------------------

UPDATE "devices" d
SET "user_id_new" = u."user_id_new"
FROM "users" u
WHERE d."user_id" = u."user_id";

UPDATE "user_settings" us
SET "user_id_new" = u."user_id_new"
FROM "users" u
WHERE us."user_id" = u."user_id";

UPDATE "user_settings" us
SET "language_id_new" = l."language_id_new"
FROM "languages" l
WHERE us."language_id" = l."language_id";

UPDATE "refresh_tokens" rt
SET "device_id_new" = d."device_id_new"
FROM "devices" d
WHERE rt."device_id" = d."device_id";

UPDATE "otp_verifications" ov
SET "user_id_new" = u."user_id_new"
FROM "users" u
WHERE ov."user_id" = u."user_id";

UPDATE "reminders" r
SET "user_id_new" = u."user_id_new"
FROM "users" u
WHERE r."user_id" = u."user_id";

UPDATE "reminders" r
SET "parent_reminder_id_new" = parent."reminder_id_new"
FROM "reminders" parent
WHERE r."parent_reminder_id" = parent."reminder_id";

UPDATE "reminder_history" rh
SET "reminder_id_new" = r."reminder_id_new"
FROM "reminders" r
WHERE rh."reminder_id" = r."reminder_id";

UPDATE "push_notification_settings" pns
SET "reminder_id_new" = r."reminder_id_new"
FROM "reminders" r
WHERE pns."reminder_id" = r."reminder_id";

UPDATE "voice_call_settings" vcs
SET "reminder_id_new" = r."reminder_id_new"
FROM "reminders" r
WHERE vcs."reminder_id" = r."reminder_id";

UPDATE "silent_hours" sh
SET "user_id_new" = u."user_id_new"
FROM "users" u
WHERE sh."user_id" = u."user_id";


-- ------------------------------------------------------------
-- 5. Make sure all required FK mappings succeeded
-- ------------------------------------------------------------

DO $$
BEGIN

    IF EXISTS (
        SELECT 1 FROM "devices"
        WHERE "user_id" IS NOT NULL
        AND "user_id_new" IS NULL
    ) THEN
        RAISE EXCEPTION 'UUID conversion failed for devices.user_id';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "user_settings"
        WHERE "user_id" IS NOT NULL
        AND "user_id_new" IS NULL
    ) THEN
        RAISE EXCEPTION 'UUID conversion failed for user_settings.user_id';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "user_settings"
        WHERE "language_id" IS NOT NULL
        AND "language_id_new" IS NULL
    ) THEN
        RAISE EXCEPTION 'UUID conversion failed for user_settings.language_id';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "refresh_tokens"
        WHERE "device_id" IS NOT NULL
        AND "device_id_new" IS NULL
    ) THEN
        RAISE EXCEPTION 'UUID conversion failed for refresh_tokens.device_id';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "otp_verifications"
        WHERE "user_id" IS NOT NULL
        AND "user_id_new" IS NULL
    ) THEN
        RAISE EXCEPTION 'UUID conversion failed for otp_verifications.user_id';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "reminders"
        WHERE "user_id" IS NOT NULL
        AND "user_id_new" IS NULL
    ) THEN
        RAISE EXCEPTION 'UUID conversion failed for reminders.user_id';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "reminder_history"
        WHERE "reminder_id" IS NOT NULL
        AND "reminder_id_new" IS NULL
    ) THEN
        RAISE EXCEPTION 'UUID conversion failed for reminder_history.reminder_id';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "push_notification_settings"
        WHERE "reminder_id" IS NOT NULL
        AND "reminder_id_new" IS NULL
    ) THEN
        RAISE EXCEPTION 'UUID conversion failed for push_notification_settings.reminder_id';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "voice_call_settings"
        WHERE "reminder_id" IS NOT NULL
        AND "reminder_id_new" IS NULL
    ) THEN
        RAISE EXCEPTION 'UUID conversion failed for voice_call_settings.reminder_id';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "silent_hours"
        WHERE "user_id" IS NOT NULL
        AND "user_id_new" IS NULL
    ) THEN
        RAISE EXCEPTION 'UUID conversion failed for silent_hours.user_id';
    END IF;

END $$;


-- ------------------------------------------------------------
-- 6. Drop foreign keys
-- ------------------------------------------------------------

ALTER TABLE "devices"
DROP CONSTRAINT IF EXISTS "devices_user_id_fkey";

ALTER TABLE "otp_verifications"
DROP CONSTRAINT IF EXISTS "otp_verifications_user_id_fkey";

ALTER TABLE "push_notification_settings"
DROP CONSTRAINT IF EXISTS "push_notification_settings_reminder_id_fkey";

ALTER TABLE "refresh_tokens"
DROP CONSTRAINT IF EXISTS "refresh_tokens_device_id_fkey";

ALTER TABLE "reminder_history"
DROP CONSTRAINT IF EXISTS "reminder_history_reminder_id_fkey";

ALTER TABLE "reminders"
DROP CONSTRAINT IF EXISTS "reminders_parent_reminder_id_fkey";

ALTER TABLE "reminders"
DROP CONSTRAINT IF EXISTS "reminders_user_id_fkey";

ALTER TABLE "silent_hours"
DROP CONSTRAINT IF EXISTS "silent_hours_user_id_fkey";

ALTER TABLE "user_settings"
DROP CONSTRAINT IF EXISTS "user_settings_language_id_fkey";

ALTER TABLE "user_settings"
DROP CONSTRAINT IF EXISTS "user_settings_user_id_fkey";

ALTER TABLE "voice_call_settings"
DROP CONSTRAINT IF EXISTS "voice_call_settings_reminder_id_fkey";


-- ------------------------------------------------------------
-- 7. Drop unique indexes that depend on old FK types
-- ------------------------------------------------------------

DROP INDEX IF EXISTS "devices_user_id_installation_id_key";
DROP INDEX IF EXISTS "user_settings_user_id_key";


-- ------------------------------------------------------------
-- 8. Drop primary keys
-- ------------------------------------------------------------

ALTER TABLE "users"
DROP CONSTRAINT "users_pkey";

ALTER TABLE "languages"
DROP CONSTRAINT "languages_pkey";

ALTER TABLE "devices"
DROP CONSTRAINT "devices_pkey";

ALTER TABLE "user_settings"
DROP CONSTRAINT "user_settings_pkey";

ALTER TABLE "refresh_tokens"
DROP CONSTRAINT "refresh_tokens_pkey";

ALTER TABLE "otp_verifications"
DROP CONSTRAINT "otp_verifications_pkey";

ALTER TABLE "reminders"
DROP CONSTRAINT "reminders_pkey";

ALTER TABLE "reminder_history"
DROP CONSTRAINT "reminder_history_pkey";

ALTER TABLE "push_notification_settings"
DROP CONSTRAINT "push_notification_settings_pkey";

ALTER TABLE "voice_call_settings"
DROP CONSTRAINT "voice_call_settings_pkey";

ALTER TABLE "silent_hours"
DROP CONSTRAINT "silent_hours_pkey";


-- ------------------------------------------------------------
-- 9. Drop old integer columns
-- ------------------------------------------------------------

ALTER TABLE "devices"
DROP COLUMN "device_id",
DROP COLUMN "user_id";

ALTER TABLE "languages"
DROP COLUMN "language_id";

ALTER TABLE "otp_verifications"
DROP COLUMN "otp_id",
DROP COLUMN "user_id";

ALTER TABLE "push_notification_settings"
DROP COLUMN "push_id",
DROP COLUMN "reminder_id";

ALTER TABLE "refresh_tokens"
DROP COLUMN "refresh_token_id",
DROP COLUMN "device_id";

ALTER TABLE "reminder_history"
DROP COLUMN "history_id",
DROP COLUMN "reminder_id";

ALTER TABLE "reminders"
DROP COLUMN "reminder_id",
DROP COLUMN "user_id",
DROP COLUMN "parent_reminder_id";

ALTER TABLE "silent_hours"
DROP COLUMN "silent_hour_id",
DROP COLUMN "user_id";

ALTER TABLE "user_settings"
DROP COLUMN "setting_id",
DROP COLUMN "user_id",
DROP COLUMN "language_id";

ALTER TABLE "users"
DROP COLUMN "user_id";

ALTER TABLE "voice_call_settings"
DROP COLUMN "call_id",
DROP COLUMN "reminder_id";


-- ------------------------------------------------------------
-- 10. Rename UUID columns to original names
-- ------------------------------------------------------------

ALTER TABLE "users"
RENAME COLUMN "user_id_new" TO "user_id";

ALTER TABLE "languages"
RENAME COLUMN "language_id_new" TO "language_id";

ALTER TABLE "devices"
RENAME COLUMN "device_id_new" TO "device_id";

ALTER TABLE "devices"
RENAME COLUMN "user_id_new" TO "user_id";

ALTER TABLE "user_settings"
RENAME COLUMN "setting_id_new" TO "setting_id";

ALTER TABLE "user_settings"
RENAME COLUMN "user_id_new" TO "user_id";

ALTER TABLE "user_settings"
RENAME COLUMN "language_id_new" TO "language_id";

ALTER TABLE "refresh_tokens"
RENAME COLUMN "refresh_token_id_new" TO "refresh_token_id";

ALTER TABLE "refresh_tokens"
RENAME COLUMN "device_id_new" TO "device_id";

ALTER TABLE "otp_verifications"
RENAME COLUMN "otp_id_new" TO "otp_id";

ALTER TABLE "otp_verifications"
RENAME COLUMN "user_id_new" TO "user_id";

ALTER TABLE "reminders"
RENAME COLUMN "reminder_id_new" TO "reminder_id";

ALTER TABLE "reminders"
RENAME COLUMN "user_id_new" TO "user_id";

ALTER TABLE "reminders"
RENAME COLUMN "parent_reminder_id_new" TO "parent_reminder_id";

ALTER TABLE "reminder_history"
RENAME COLUMN "history_id_new" TO "history_id";

ALTER TABLE "reminder_history"
RENAME COLUMN "reminder_id_new" TO "reminder_id";

ALTER TABLE "push_notification_settings"
RENAME COLUMN "push_id_new" TO "push_id";

ALTER TABLE "push_notification_settings"
RENAME COLUMN "reminder_id_new" TO "reminder_id";

ALTER TABLE "voice_call_settings"
RENAME COLUMN "call_id_new" TO "call_id";

ALTER TABLE "voice_call_settings"
RENAME COLUMN "reminder_id_new" TO "reminder_id";

ALTER TABLE "silent_hours"
RENAME COLUMN "silent_hour_id_new" TO "silent_hour_id";

ALTER TABLE "silent_hours"
RENAME COLUMN "user_id_new" TO "user_id";


-- ------------------------------------------------------------
-- 11. Set primary keys
-- ------------------------------------------------------------

ALTER TABLE "users"
ADD CONSTRAINT "users_pkey"
PRIMARY KEY ("user_id");

ALTER TABLE "languages"
ADD CONSTRAINT "languages_pkey"
PRIMARY KEY ("language_id");

ALTER TABLE "devices"
ADD CONSTRAINT "devices_pkey"
PRIMARY KEY ("device_id");

ALTER TABLE "user_settings"
ADD CONSTRAINT "user_settings_pkey"
PRIMARY KEY ("setting_id");

ALTER TABLE "refresh_tokens"
ADD CONSTRAINT "refresh_tokens_pkey"
PRIMARY KEY ("refresh_token_id");

ALTER TABLE "otp_verifications"
ADD CONSTRAINT "otp_verifications_pkey"
PRIMARY KEY ("otp_id");

ALTER TABLE "reminders"
ADD CONSTRAINT "reminders_pkey"
PRIMARY KEY ("reminder_id");

ALTER TABLE "reminder_history"
ADD CONSTRAINT "reminder_history_pkey"
PRIMARY KEY ("history_id");

ALTER TABLE "push_notification_settings"
ADD CONSTRAINT "push_notification_settings_pkey"
PRIMARY KEY ("push_id");

ALTER TABLE "voice_call_settings"
ADD CONSTRAINT "voice_call_settings_pkey"
PRIMARY KEY ("call_id");

ALTER TABLE "silent_hours"
ADD CONSTRAINT "silent_hours_pkey"
PRIMARY KEY ("silent_hour_id");


-- ------------------------------------------------------------
-- 12. Recreate unique indexes
-- ------------------------------------------------------------

CREATE UNIQUE INDEX "devices_user_id_installation_id_key"
ON "devices"("user_id", "installation_id");

CREATE UNIQUE INDEX "user_settings_user_id_key"
ON "user_settings"("user_id");


-- ------------------------------------------------------------
-- 13. Recreate foreign keys
-- ------------------------------------------------------------

ALTER TABLE "user_settings"
ADD CONSTRAINT "user_settings_user_id_fkey"
FOREIGN KEY ("user_id")
REFERENCES "users"("user_id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "user_settings"
ADD CONSTRAINT "user_settings_language_id_fkey"
FOREIGN KEY ("language_id")
REFERENCES "languages"("language_id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "devices"
ADD CONSTRAINT "devices_user_id_fkey"
FOREIGN KEY ("user_id")
REFERENCES "users"("user_id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "refresh_tokens"
ADD CONSTRAINT "refresh_tokens_device_id_fkey"
FOREIGN KEY ("device_id")
REFERENCES "devices"("device_id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "otp_verifications"
ADD CONSTRAINT "otp_verifications_user_id_fkey"
FOREIGN KEY ("user_id")
REFERENCES "users"("user_id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "reminders"
ADD CONSTRAINT "reminders_user_id_fkey"
FOREIGN KEY ("user_id")
REFERENCES "users"("user_id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "reminders"
ADD CONSTRAINT "reminders_parent_reminder_id_fkey"
FOREIGN KEY ("parent_reminder_id")
REFERENCES "reminders"("reminder_id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "reminder_history"
ADD CONSTRAINT "reminder_history_reminder_id_fkey"
FOREIGN KEY ("reminder_id")
REFERENCES "reminders"("reminder_id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "push_notification_settings"
ADD CONSTRAINT "push_notification_settings_reminder_id_fkey"
FOREIGN KEY ("reminder_id")
REFERENCES "reminders"("reminder_id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "voice_call_settings"
ADD CONSTRAINT "voice_call_settings_reminder_id_fkey"
FOREIGN KEY ("reminder_id")
REFERENCES "reminders"("reminder_id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "silent_hours"
ADD CONSTRAINT "silent_hours_user_id_fkey"
FOREIGN KEY ("user_id")
REFERENCES "users"("user_id")
ON DELETE CASCADE
ON UPDATE CASCADE;