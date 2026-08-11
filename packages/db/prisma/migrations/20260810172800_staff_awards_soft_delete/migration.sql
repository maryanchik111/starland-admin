-- staff_awards was created without deleted_at, so a wrongly-added award
-- could never be removed without a physical DELETE — CLAUDE.md §4/§9
-- require deleted_at wherever removal is possible, never DELETE.
ALTER TABLE "staff_awards" ADD COLUMN "deleted_at" TIMESTAMPTZ;
