ALTER TABLE "approvals" ADD COLUMN "idempotency_key" TEXT;
ALTER TABLE "payments" ADD COLUMN "idempotency_key" TEXT;
CREATE UNIQUE INDEX "approvals_case_id_idempotency_key_key" ON "approvals"("case_id", "idempotency_key");
CREATE UNIQUE INDEX "payments_case_id_idempotency_key_key" ON "payments"("case_id", "idempotency_key");
