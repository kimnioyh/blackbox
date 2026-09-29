-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('CREATED', 'IN_PROGRESS', 'VERIFIED', 'BLOCKED', 'DISPUTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('USER_INSTRUCTION', 'POLICY_PARSED', 'AGENT_DECISION', 'POLICY_CHECK', 'HUMAN_APPROVAL', 'PAYMENT_EXECUTED', 'PAYMENT_BLOCKED', 'DISPUTE_CREATED', 'AUDIT_RESULT', 'PROOF_RECORDED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'AGENT', 'SYSTEM', 'EXTERNAL_SERVICE');

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('REST_API', 'MCP', 'INTERNAL', 'PAYMENT_PROVIDER', 'BLOCKCHAIN');

-- CreateEnum
CREATE TYPE "VerificationLevel" AS ENUM ('SELF_REPORTED', 'SIGNED', 'EXTERNALLY_VERIFIED', 'ON_CHAIN');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AuditVerdict" AS ENUM ('COMPLIANT', 'VIOLATION', 'INCONCLUSIVE');

-- CreateEnum
CREATE TYPE "ProofStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "FlowType" AS ENUM ('POLICY_EXTRACTION', 'AUDIT_EXPLANATION');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "external_agent_id" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "owner_user_id" TEXT,
    "agent_id" TEXT,
    "external_user_id" TEXT,
    "external_case_id" TEXT,
    "title" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'CREATED',
    "current_policy_version" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "event_type" "EventType" NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" TEXT,
    "source" "EventSource" NOT NULL,
    "verification_level" "VerificationLevel" NOT NULL,
    "payload" JSONB NOT NULL,
    "previous_event_hash" TEXT,
    "event_hash" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "max_amount" DECIMAL(20,2),
    "currency" TEXT,
    "allowed_merchants" JSONB NOT NULL,
    "deadline" TIMESTAMP(3),
    "raw_policy" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "actor_user_id" TEXT,
    "external_actor_id" TEXT,
    "approved_amount" DECIMAL(20,2),
    "currency" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "external_payment_id" TEXT,
    "merchant" TEXT NOT NULL,
    "subtotal" DECIMAL(20,2) NOT NULL,
    "fee" DECIMAL(20,2) NOT NULL,
    "total_amount" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_results" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "verdict" "AuditVerdict" NOT NULL,
    "summary" TEXT NOT NULL,
    "violations" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blockchain_proofs" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "record_hash" TEXT NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "contract_address" TEXT NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "block_number" BIGINT,
    "status" "ProofStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "blockchain_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_invocations" (
    "id" TEXT NOT NULL,
    "case_id" TEXT,
    "flow_type" "FlowType" NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "total_tokens" INTEGER NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_invocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_user_id_organization_id_key" ON "organization_members"("user_id", "organization_id");

-- CreateIndex
CREATE INDEX "cases_created_at_idx" ON "cases"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "events_case_id_idempotency_key_key" ON "events"("case_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "events_case_id_sequence_key" ON "events"("case_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "policies_case_id_version_key" ON "policies"("case_id", "version");

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_results" ADD CONSTRAINT "audit_results_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blockchain_proofs" ADD CONSTRAINT "blockchain_proofs_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_invocations" ADD CONSTRAINT "model_invocations_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Business history is immutable even if another code path reaches the database.
CREATE FUNCTION reject_history_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Historical % rows are append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_append_only
BEFORE UPDATE OR DELETE ON "events"
FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE TRIGGER policies_append_only
BEFORE UPDATE OR DELETE ON "policies"
FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
