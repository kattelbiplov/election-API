/* eslint-disable no-console */
import { PrismaClient, UserRole, MunicipalityType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Enables PostGIS now so it's available for the Household GIS module later
  // without a separate migration step. Harmless no-op if already enabled.
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS postgis');

  // --- Platform organization + SUPER_ADMIN -------------------------------
  // SUPER_ADMIN accounts are platform operators, not tied to a specific
  // campaign. They still need a `organizationId` (the column is NOT NULL by
  // design — see schema.prisma notes), so they live in this reserved org.
  const platformOrg = await prisma.organization.upsert({
    where: { slug: 'platform' },
    update: {},
    create: { name: 'Platform Operations', slug: 'platform' },
  });

  const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe123!';
  await prisma.user.upsert({
    where: { email: 'superadmin@election-platform.local' },
    update: {},
    create: {
      organizationId: platformOrg.id,
      name: 'Platform Super Admin',
      email: 'superadmin@election-platform.local',
      passwordHash: await bcrypt.hash(superAdminPassword, 12),
      role: UserRole.SUPER_ADMIN,
    },
  });

  // --- Sample campaign organization + admin ------------------------------
  const demoOrg = await prisma.organization.upsert({
    where: { slug: 'demo-campaign' },
    update: {},
    create: { name: 'Demo Campaign', slug: 'demo-campaign' },
  });

  const campaignAdminPassword = process.env.SEED_CAMPAIGN_ADMIN_PASSWORD ?? 'ChangeMe123!';
  await prisma.user.upsert({
    where: { email: 'admin@demo-campaign.local' },
    update: {},
    create: {
      organizationId: demoOrg.id,
      name: 'Demo Campaign Admin',
      email: 'admin@demo-campaign.local',
      passwordHash: await bcrypt.hash(campaignAdminPassword, 12),
      role: UserRole.CAMPAIGN_ADMIN,
    },
  });

  // --- Sample Nepal administrative hierarchy ------------------------------
  // A small representative slice (Bagmati Province -> Kathmandu District ->
  // Kathmandu Metropolitan City), NOT the full official dataset. Loading all
  // 7 provinces / 77 districts / 753 local levels / ~6,700 wards is a real
  // one-time data-import job for the Voter Data Import module (spec section
  // 4), using an authoritative Election Commission / NSO source — do not
  // hand-type that list into a seed file.
  const bagmati = await prisma.province.upsert({
    where: { code: 3 },
    update: {},
    create: { code: 3, name: 'Bagmati Province', nameNepali: 'बागमती प्रदेश' },
  });

  const kathmanduDistrict = await prisma.district.upsert({
    where: { provinceId_code: { provinceId: bagmati.id, code: 'KTM' } },
    update: {},
    create: { provinceId: bagmati.id, code: 'KTM', name: 'Kathmandu', nameNepali: 'काठमाडौं' },
  });

  const ktmMetro = await prisma.municipality.upsert({
    where: { districtId_code: { districtId: kathmanduDistrict.id, code: 'KTM-METRO-01' } },
    update: {},
    create: {
      districtId: kathmanduDistrict.id,
      code: 'KTM-METRO-01',
      name: 'Kathmandu Metropolitan City',
      nameNepali: 'काठमाडौं महानगरपालिका',
      type: MunicipalityType.METROPOLITAN_CITY,
      totalWards: 32,
    },
  });

  const ward5 = await prisma.ward.upsert({
    where: { municipalityId_wardNumber: { municipalityId: ktmMetro.id, wardNumber: 5 } },
    update: {},
    create: { municipalityId: ktmMetro.id, wardNumber: 5 },
  });

  await prisma.tole.upsert({
    where: { organizationId_wardId_name: { organizationId: demoOrg.id, wardId: ward5.id, name: 'Sample Tole' } },
    update: {},
    create: {
      organizationId: demoOrg.id,
      wardId: ward5.id,
      name: 'Sample Tole',
      nameNepali: 'नमूना टोल',
    },
  });

  console.log('Seed complete.');
  console.log(`  Super admin: superadmin@election-platform.local / ${superAdminPassword}`);
  console.log(`  Demo campaign admin: admin@demo-campaign.local / ${campaignAdminPassword}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
