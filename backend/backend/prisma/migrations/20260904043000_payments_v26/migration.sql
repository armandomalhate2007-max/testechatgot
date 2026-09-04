ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'MOCK';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "failureCode" TEXT, ADD COLUMN IF NOT EXISTS "providerTransactionId" TEXT, ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
CREATE TABLE IF NOT EXISTS "PaymentEvent" ("id" TEXT NOT NULL,"paymentId" TEXT NOT NULL,"type" TEXT NOT NULL,"providerEventId" TEXT,"payload" JSONB,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentEvent_providerEventId_key" ON "PaymentEvent"("providerEventId");
CREATE INDEX IF NOT EXISTS "PaymentEvent_paymentId_idx" ON "PaymentEvent"("paymentId");
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
