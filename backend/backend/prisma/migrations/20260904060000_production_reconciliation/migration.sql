-- Production reconciliation migration.
-- The earlier project history could leave these objects out of the migration chain
-- even though the current Prisma schema and application require them. Everything here
-- is intentionally idempotent so it is safe against an already-correct Neon database.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "images" JSONB;
UPDATE "Product"
SET "images" = jsonb_build_array("imageUrl")
WHERE "images" IS NULL
  AND "imageUrl" IS NOT NULL
  AND "imageUrl" <> '';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentStatus') THEN
    CREATE TYPE "PaymentStatus" AS ENUM ('PENDING','PROCESSING','PAID','FAILED','CANCELLED','REFUNDED','EXPIRED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentMethod') THEN
    CREATE TYPE "PaymentMethod" AS ENUM ('MANUAL','MPESA','EMOLA','MOCK');
  END IF;
END $$;

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'MOCK';

CREATE TABLE IF NOT EXISTS "Payment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "provider" TEXT NOT NULL,
  "providerReference" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" "Currency" NOT NULL,
  "customerPhone" TEXT,
  "failureReason" TEXT,
  "failureCode" TEXT,
  "providerPayload" JSONB,
  "providerTransactionId" TEXT,
  "expiresAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "method" "PaymentMethod";
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "status" "PaymentStatus" DEFAULT 'PENDING';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "providerReference" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(12,2);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "currency" "Currency";
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "customerPhone" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "failureCode" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "providerPayload" JSONB;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "providerTransactionId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_providerReference_key" ON "Payment"("providerReference");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "Payment_orderId_idx" ON "Payment"("orderId");
CREATE INDEX IF NOT EXISTS "Payment_status_createdAt_idx" ON "Payment"("status","createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_orderId_fkey') THEN
    ALTER TABLE "Payment"
      ADD CONSTRAINT "Payment_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PaymentEvent" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "providerEventId" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentEvent_providerEventId_key" ON "PaymentEvent"("providerEventId");
CREATE INDEX IF NOT EXISTS "PaymentEvent_paymentId_idx" ON "PaymentEvent"("paymentId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentEvent_paymentId_fkey') THEN
    ALTER TABLE "PaymentEvent"
      ADD CONSTRAINT "PaymentEvent_paymentId_fkey"
      FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
