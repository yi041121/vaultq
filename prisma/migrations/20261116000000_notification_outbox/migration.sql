-- Additive only. Test on an isolated database before production rollout.
CREATE TABLE "notification_jobs" (
    "id" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_jobs_dedupe_key_key" ON "notification_jobs"("dedupe_key");
CREATE INDEX "notification_jobs_completed_at_failed_at_available_at_idx"
    ON "notification_jobs"("completed_at", "failed_at", "available_at");
