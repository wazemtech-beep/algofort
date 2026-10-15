-- Additive, repeatable migration. Does not drop or reset business records.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "Credential" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Credential" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE "Credential" ADD COLUMN IF NOT EXISTS "hostingCompanyId" TEXT;
ALTER TABLE "Credential" ADD COLUMN IF NOT EXISTS "host" TEXT;
ALTER TABLE "Credential" ADD COLUMN IF NOT EXISTS "port" INTEGER;
ALTER TABLE "Credential" ADD COLUMN IF NOT EXISTS "loginUrl" TEXT;
CREATE INDEX IF NOT EXISTS "Credential_category_hostingCompanyId_idx" ON "Credential"("category", "hostingCompanyId");
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "fatherName" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "cnic" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "cnicAttachmentId" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "joiningDate" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "referral" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "employmentType" TEXT NOT NULL DEFAULT 'PERMANENT';
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "contractStart" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "contractEnd" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "probationEnd" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankId" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "accountTitle" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "accountNumber" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "iban" TEXT;
CREATE TABLE IF NOT EXISTS "DirectoryEntry" ("id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL, "name" TEXT NOT NULL, "url" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "DirectoryEntry_kind_name_key" ON "DirectoryEntry"("kind", "name");
CREATE TABLE IF NOT EXISTS "PrivateFile" ("id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL, "name" TEXT NOT NULL, "mime" TEXT NOT NULL, "encryptedData" TEXT NOT NULL, "size" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS "Appearance" ("id" TEXT PRIMARY KEY DEFAULT 'default', "brandName" TEXT NOT NULL DEFAULT 'Algofort', "primary" TEXT NOT NULL DEFAULT '#285742', "accent" TEXT NOT NULL DEFAULT '#eaf0e4', "background" TEXT NOT NULL DEFAULT '#f5f6f2', "logo" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
-- Existing completed/fully paid projects get the corresponding state without
-- changing work completion or inventing historic completion timestamps.
UPDATE "Project" p SET "closedAt" = CURRENT_TIMESTAMP WHERE p."closedAt" IS NULL AND p."status" <> 'CANCELLED' AND p."agreedAmount" > 0 AND (SELECT COALESCE(SUM(pay."amount"),0) FROM "Payment" pay WHERE pay."projectId"=p."id" AND pay."voidedAt" IS NULL) >= p."agreedAmount";
