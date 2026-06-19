import { PrismaClient, UserRole, LeadSource, LeadStatus, Temperature, Priority } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create organization
  const org = await prisma.organization.create({
    data: {
      name: 'Demo Agency',
      slug: 'demo-agency',
      description: 'A demo digital agency',
      industry: 'Technology',
    },
  });

  console.log(`✅ Organization created: ${org.name}`);

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.create({
    data: {
      email: 'admin@leadflow.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: UserRole.ADMIN,
      organizationId: org.id,
    },
  });

  console.log(`✅ Admin created: ${admin.email} / admin123`);

  // Create demo leads
  const demoLeads = [
    {
      businessName: 'Riyadh Dental Center',
      contactName: 'Dr. Ahmed Al-Saud',
      email: 'info@riyadhdental.com',
      phone: '+966501234567',
      website: 'https://riyadhdental.example.com',
      industry: 'Healthcare',
      category: 'Dental Clinic',
      city: 'Riyadh',
      country: 'Saudi Arabia',
      score: 85,
      temperature: Temperature.HOT,
      priority: Priority.HIGH,
      status: LeadStatus.NEW,
      source: LeadSource.GOOGLE_MAPS,
      signals: [
        { type: 'NO_SSL', score: 10, message: 'Website lacks SSL' },
        { type: 'POOR_SEO', score: 20, message: 'Poor SEO optimization' },
      ],
    },
    {
      businessName: 'Dubai Fashion Boutique',
      contactName: 'Sarah Mohammad',
      email: 'contact@dubaifashion.ae',
      phone: '+971501234567',
      website: null,
      industry: 'Retail',
      category: 'Fashion Boutique',
      city: 'Dubai',
      country: 'UAE',
      score: 90,
      temperature: Temperature.HOT,
      priority: Priority.CRITICAL,
      status: LeadStatus.NEW,
      source: LeadSource.GOOGLE_MAPS,
      signals: [
        { type: 'NO_WEBSITE', score: 50, message: 'No website found' },
        { type: 'POOR_SEO', score: 20, message: 'No online presence' },
      ],
    },
    {
      businessName: 'Cairo Tech Solutions',
      contactName: 'Mohammad Hassan',
      email: 'info@cairotech.eg',
      phone: '+201012345678',
      website: 'https://cairotech.example.com',
      industry: 'Technology',
      category: 'IT Services',
      city: 'Cairo',
      country: 'Egypt',
      score: 65,
      temperature: Temperature.WARM,
      priority: Priority.MEDIUM,
      status: LeadStatus.CONTACTED,
      source: LeadSource.LINKEDIN,
      signals: [
        { type: 'HIRING', score: 20, message: 'Hiring developers' },
        { type: 'GROWTH', score: 25, message: 'Expanding team' },
      ],
    },
    {
      businessName: 'Jeddah Restaurant Group',
      contactName: 'Faisal Al-Otaibi',
      email: 'admin@jeddahrestaurants.com',
      phone: '+966502345678',
      website: 'https://jeddahrestaurants.example.com',
      industry: 'Food & Beverage',
      category: 'Restaurant',
      city: 'Jeddah',
      country: 'Saudi Arabia',
      score: 75,
      temperature: Temperature.WARM,
      priority: Priority.HIGH,
      status: LeadStatus.NEW,
      source: LeadSource.REDDIT,
      signals: [
        { type: 'INTENT_SIGNAL', score: 50, message: 'Looking for web developer' },
        { type: 'NO_SSL', score: 10, message: 'No SSL certificate' },
      ],
    },
    {
      businessName: 'Kuwait Real Estate Co',
      contactName: 'Abdullah Al-Kuwaiti',
      email: 'sales@kwrealestate.com',
      phone: '+96550123456',
      website: null,
      industry: 'Real Estate',
      category: 'Real Estate Agency',
      city: 'Kuwait City',
      country: 'Kuwait',
      score: 80,
      temperature: Temperature.HOT,
      priority: Priority.HIGH,
      status: LeadStatus.NEW,
      source: LeadSource.GOOGLE_MAPS,
      signals: [
        { type: 'NO_WEBSITE', score: 50, message: 'No website found' },
        { type: 'WEAK_BRANDING', score: 10, message: 'No online presence' },
      ],
    },
    {
      businessName: 'Manama Digital Marketing',
      contactName: 'Khalid Al-Khalifa',
      email: 'info@manamadigital.bh',
      phone: '+97350123456',
      website: 'https://manamadigital.example.com',
      industry: 'Marketing',
      category: 'Marketing Agency',
      city: 'Manama',
      country: 'Bahrain',
      score: 55,
      temperature: Temperature.WARM,
      priority: Priority.MEDIUM,
      status: LeadStatus.QUALIFIED,
      source: LeadSource.IMPORT,
      signals: [
        { type: 'SLOW_WEBSITE', score: 15, message: 'Slow loading speed' },
        { type: 'POOR_SEO', score: 20, message: 'SEO issues detected' },
      ],
    },
    {
      businessName: 'Doha Fitness Center',
      contactName: 'Nasser Al-Thani',
      email: 'info@dohafitness.qa',
      phone: '+97450123456',
      website: null,
      industry: 'Fitness',
      category: 'Gym',
      city: 'Doha',
      country: 'Qatar',
      score: 70,
      temperature: Temperature.WARM,
      priority: Priority.HIGH,
      status: LeadStatus.NEW,
      source: LeadSource.GOOGLE_MAPS,
      signals: [
        { type: 'NO_WEBSITE', score: 50, message: 'No website found' },
      ],
    },
    {
      businessName: 'Muscat Auto Repair',
      contactName: 'Said Al-Busaidi',
      email: 'repair@muscatauto.om',
      phone: '+96850123456',
      website: 'https://muscatauto.example.com',
      industry: 'Automotive',
      category: 'Auto Repair',
      city: 'Muscat',
      country: 'Oman',
      score: 45,
      temperature: Temperature.COLD,
      priority: Priority.LOW,
      status: LeadStatus.NEW,
      source: LeadSource.GOOGLE_MAPS,
      signals: [
        { type: 'NOT_MOBILE_FRIENDLY', score: 25, message: 'Not mobile responsive' },
      ],
    },
  ];

  for (const leadData of demoLeads) {
    await prisma.lead.create({
      data: {
        ...leadData,
        organizationId: org.id,
        createdById: admin.id,
        signals: leadData.signals as any,
      },
    });
  }

  console.log(`✅ ${demoLeads.length} demo leads created`);

  // Create demo campaign
  const campaign = await prisma.campaign.create({
    data: {
      name: 'Q1 Web Development Outreach',
      description: 'Outreach campaign for web development services',
      type: 'EMAIL',
      status: 'DRAFT',
      organizationId: org.id,
      createdById: admin.id,
    },
  });

  console.log(`✅ Demo campaign created: ${campaign.name}`);

  console.log('\n🎉 Seed completed successfully!');
  console.log(`Login with: admin@leadflow.com / admin123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });