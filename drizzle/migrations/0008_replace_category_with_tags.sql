ALTER TABLE "tasks" ADD COLUMN "tags" json DEFAULT '[]'::json;
UPDATE "tasks" SET "tags" = json_build_array("category") WHERE "category" IS NOT NULL;
ALTER TABLE "tasks" DROP COLUMN "category";
