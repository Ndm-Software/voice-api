ALTER TABLE "devices" ADD COLUMN     "installation_id" UUID,
ADD COLUMN     "push_token_hash" CHAR(64),
ALTER COLUMN "push_token" DROP NOT NULL,
ALTER COLUMN "last_active" SET DEFAULT CURRENT_TIMESTAMP;

UPDATE "devices"
SET "installation_id" = (
  '00000000-0000-4000-8000-' || LPAD("device_id"::TEXT, 12, '0')
)::UUID,
"push_token_hash" = CASE
  WHEN "push_token" IS NULL THEN NULL
  ELSE ENCODE(SHA256(CONVERT_TO("push_token", 'UTF8')), 'hex')
END;

WITH "ranked_tokens" AS (
  SELECT
    "device_id",
    ROW_NUMBER() OVER (
      PARTITION BY "push_token_hash"
      ORDER BY "is_active" DESC, "last_active" DESC, "device_id" DESC
    ) AS "token_rank"
  FROM "devices"
  WHERE "push_token_hash" IS NOT NULL
)
UPDATE "devices"
SET "push_token" = NULL,
    "push_token_hash" = NULL
FROM "ranked_tokens"
WHERE "devices"."device_id" = "ranked_tokens"."device_id"
  AND "ranked_tokens"."token_rank" > 1;

ALTER TABLE "devices" ALTER COLUMN "installation_id" SET NOT NULL;

ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_device_id_fkey";
ALTER TABLE "devices" DROP CONSTRAINT "devices_user_id_fkey";

ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("device_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "devices_push_token_hash_key" ON "devices"("push_token_hash");

CREATE UNIQUE INDEX "devices_user_id_installation_id_key" ON "devices"("user_id", "installation_id");
