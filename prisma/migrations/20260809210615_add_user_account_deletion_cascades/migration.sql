ALTER TABLE "user_settings" DROP CONSTRAINT "user_settings_user_id_fkey";
ALTER TABLE "otp_verifications" DROP CONSTRAINT "otp_verifications_user_id_fkey";
ALTER TABLE "reminders" DROP CONSTRAINT "reminders_user_id_fkey";

ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "otp_verifications" ADD CONSTRAINT "otp_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
