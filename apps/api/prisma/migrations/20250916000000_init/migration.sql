-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "industry" TEXT,
    "primaryService" TEXT,
    "country" TEXT,
    "city" TEXT,
    "state" TEXT,
    "employeeRange" TEXT,
    "estimatedRevenueUsd" DOUBLE PRECISION,
    "foundedYear" INTEGER,
    "ownership" TEXT,
    "customerProfile" TEXT,
    "businessModel" TEXT,
    "revenueModel" TEXT,
    "geography" TEXT,
    "keyServices" TEXT,
    "growthSignal" TEXT,
    "reputationSignal" TEXT,
    "technologyStack" TEXT,
    "linkedinUrl" TEXT,
    "companyDescription" TEXT,
    "demoFit" TEXT,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dna" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Search" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "idealDna" JSONB,
    "criteria" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "Search_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferenceCompany" (
    "id" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    CONSTRAINT "ReferenceCompany_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SimilarityResult" (
    "id" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "dimensions" JSONB NOT NULL,
    "explanation" JSONB NOT NULL,
    CONSTRAINT "SimilarityResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Qualification" (
    "id" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "businessFit" INTEGER NOT NULL,
    "strategicFit" INTEGER NOT NULL,
    "qualificationScore" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "positiveSignals" JSONB NOT NULL,
    "risks" JSONB NOT NULL,
    "missingInformation" JSONB NOT NULL,
    "recommendation" TEXT NOT NULL,
    "hardExclusion" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Qualification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'csv',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Company_name_idx" ON "Company"("name");
CREATE INDEX "Company_industry_idx" ON "Company"("industry");
CREATE INDEX "Company_geography_idx" ON "Company"("geography");
CREATE UNIQUE INDEX "CompanyProfile_companyId_key" ON "CompanyProfile"("companyId");
CREATE INDEX "Search_userId_createdAt_idx" ON "Search"("userId", "createdAt");
CREATE UNIQUE INDEX "ReferenceCompany_searchId_companyId_key" ON "ReferenceCompany"("searchId", "companyId");
CREATE UNIQUE INDEX "SimilarityResult_searchId_companyId_key" ON "SimilarityResult"("searchId", "companyId");
CREATE INDEX "SimilarityResult_searchId_overallScore_idx" ON "SimilarityResult"("searchId", "overallScore");
CREATE UNIQUE INDEX "Qualification_searchId_companyId_key" ON "Qualification"("searchId", "companyId");
CREATE INDEX "Qualification_searchId_qualificationScore_idx" ON "Qualification"("searchId", "qualificationScore");
CREATE INDEX "Evidence_companyId_idx" ON "Evidence"("companyId");

ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Search" ADD CONSTRAINT "Search_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferenceCompany" ADD CONSTRAINT "ReferenceCompany_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "Search"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferenceCompany" ADD CONSTRAINT "ReferenceCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SimilarityResult" ADD CONSTRAINT "SimilarityResult_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "Search"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SimilarityResult" ADD CONSTRAINT "SimilarityResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Qualification" ADD CONSTRAINT "Qualification_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "Search"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Qualification" ADD CONSTRAINT "Qualification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
