import type { Company } from '@prisma/client';
import {
  buildCompanyDnaFromCsvRow,
  type CompanyDna,
  type CsvCompanyRow,
} from '@ali/shared';

export function companyToCsvRow(c: Company): CsvCompanyRow {
  return {
    company_id: c.id,
    company_name: c.name,
    website: c.website ?? '',
    industry: c.industry ?? '',
    primary_service: c.primaryService ?? '',
    country: c.country ?? '',
    city: c.city ?? '',
    state: c.state ?? '',
    employee_range: c.employeeRange ?? '',
    estimated_revenue_usd:
      c.estimatedRevenueUsd != null ? String(c.estimatedRevenueUsd) : '',
    founded_year: c.foundedYear != null ? String(c.foundedYear) : '',
    ownership: c.ownership ?? '',
    customer_profile: c.customerProfile ?? '',
    business_model: c.businessModel ?? '',
    revenue_model: c.revenueModel ?? '',
    geography: c.geography ?? '',
    key_services: c.keyServices ?? '',
    growth_signal: c.growthSignal ?? '',
    reputation_signal: c.reputationSignal ?? '',
    technology_stack: c.technologyStack ?? '',
    linkedin_url: c.linkedinUrl ?? '',
    company_description: c.companyDescription ?? '',
    // Pass through for DNA _meta only — scoring never reads this
    demo_fit: c.demoFit ?? '',
  };
}

export function companyToDna(c: Company): CompanyDna {
  return buildCompanyDnaFromCsvRow(companyToCsvRow(c));
}
