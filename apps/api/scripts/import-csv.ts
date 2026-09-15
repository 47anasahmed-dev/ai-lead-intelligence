import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from '@prisma/client';
import {
  buildCompanyDnaFromCsvRow,
  parseRevenue,
  parseYear,
  blankToNull,
  type CsvCompanyRow,
} from '@ali/shared';
import 'dotenv/config';

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const csvPath =
    process.argv[2] ??
    path.resolve(__dirname, '../../../data/demo-companies.csv');

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as CsvCompanyRow[];

  let upserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of records) {
    const id = blankToNull(row.company_id);
    const name = blankToNull(row.company_name);
    if (!id || !name) {
      skipped += 1;
      errors.push(`Missing id/name: ${JSON.stringify(row).slice(0, 80)}`);
      continue;
    }

    // Only accept clean demo_fit labels as metadata; ignore corrupted spillover cells
    const demoRaw = blankToNull(row.demo_fit);
    const demoFit =
      demoRaw && /^(high|medium|low|reject)$/i.test(demoRaw) ? demoRaw : null;

    try {
      const company = await prisma.company.upsert({
        where: { id },
        create: {
          id,
          name,
          website: blankToNull(row.website),
          industry: blankToNull(row.industry),
          primaryService: blankToNull(row.primary_service),
          country: blankToNull(row.country),
          city: blankToNull(row.city),
          state: blankToNull(row.state),
          employeeRange: blankToNull(row.employee_range),
          estimatedRevenueUsd: parseRevenue(row.estimated_revenue_usd),
          foundedYear: parseYear(row.founded_year),
          ownership: blankToNull(row.ownership),
          customerProfile: blankToNull(row.customer_profile),
          businessModel: blankToNull(row.business_model),
          revenueModel: blankToNull(row.revenue_model),
          geography: blankToNull(row.geography),
          keyServices: blankToNull(row.key_services),
          growthSignal: blankToNull(row.growth_signal),
          reputationSignal: blankToNull(row.reputation_signal),
          technologyStack: blankToNull(row.technology_stack),
          linkedinUrl: blankToNull(row.linkedin_url),
          companyDescription: blankToNull(row.company_description),
          demoFit,
          rawData: row,
        },
        update: {
          name,
          website: blankToNull(row.website),
          industry: blankToNull(row.industry),
          primaryService: blankToNull(row.primary_service),
          country: blankToNull(row.country),
          city: blankToNull(row.city),
          state: blankToNull(row.state),
          employeeRange: blankToNull(row.employee_range),
          estimatedRevenueUsd: parseRevenue(row.estimated_revenue_usd),
          foundedYear: parseYear(row.founded_year),
          ownership: blankToNull(row.ownership),
          customerProfile: blankToNull(row.customer_profile),
          businessModel: blankToNull(row.business_model),
          revenueModel: blankToNull(row.revenue_model),
          geography: blankToNull(row.geography),
          keyServices: blankToNull(row.key_services),
          growthSignal: blankToNull(row.growth_signal),
          reputationSignal: blankToNull(row.reputation_signal),
          technologyStack: blankToNull(row.technology_stack),
          linkedinUrl: blankToNull(row.linkedin_url),
          companyDescription: blankToNull(row.company_description),
          demoFit,
          rawData: row,
        },
      });

      const dna = buildCompanyDnaFromCsvRow({ ...row, demo_fit: demoFit ?? '' });
      await prisma.companyProfile.upsert({
        where: { companyId: company.id },
        create: { companyId: company.id, dna },
        update: { dna },
      });

      upserted += 1;
    } catch (e) {
      skipped += 1;
      errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const total = await prisma.company.count();
  console.log(
    JSON.stringify(
      { upserted, skipped, totalInDb: total, errorSample: errors.slice(0, 5) },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
