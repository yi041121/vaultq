CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "auth_rate_limit_buckets" (
    "key" VARCHAR(96) NOT NULL,
    "attempts" INTEGER NOT NULL,
    "reset_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "auth_rate_limit_buckets_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "auth_rate_limit_attempts_positive" CHECK ("attempts" > 0)
);
CREATE INDEX "auth_rate_limit_buckets_reset_at_idx" ON "auth_rate_limit_buckets"("reset_at");
