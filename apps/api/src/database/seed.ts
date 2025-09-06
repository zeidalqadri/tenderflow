/* eslint-disable no-console */
import { PrismaClient, TenderStatus, TenderCategory, UserRole, TenderRole, DocumentType } from '../generated/prisma';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create system configuration
  await seedSystemConfig();

  // Create tenants
  const tenants = await seedTenants();

  // Create users for each tenant
  const users = await seedUsers(tenants);

  // Create tenders with full workflow
  const tenders = await seedTenders(tenants, users);

  // Create tender assignments
  await seedTenderAssignments(tenders, users);

  // Create bids for tenders
  await seedBids(tenders, users);

  // Create documents
  await seedDocuments(tenders, users);

  // Create submissions
  await seedSubmissions(tenders, users);

  // Create validations
  await seedValidations(tenders);

  // Create state transitions
  await seedStateTransitions(tenders, users);

  // Create comments
  await seedComments(tenders, users);

  // Create notifications
  await seedNotifications(users, tenders);

  // Create audit logs
  await seedAuditLogs(tenants, users);

  console.log('✅ Database seed completed successfully!');
}

async function seedSystemConfig() {
  console.log('📊 Seeding system configuration...');

  const configs = [
    {
      key: 'max_file_size',
      value: { bytes: 104857600, description: '100MB' },
      description: 'Maximum file upload size',
    },
    {
      key: 'allowed_file_types',
      value: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'jpg', 'jpeg', 'png', 'gif'],
      description: 'Allowed file types for upload',
    },
    {
      key: 'tender_auto_archive_days',
      value: 365,
      description: 'Days after which completed tenders are auto-archived',
    },
    {
      key: 'ocr_enabled',
      value: true,
      description: 'Enable OCR processing for document parsing',
    },
    {
      key: 'notification_settings',
      value: {
        email_enabled: true,
        push_enabled: true,
        batch_size: 50,
        delay_minutes: 5,
      },
      description: 'Notification system settings',
    },
  ];

  for (const config of configs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: { value: config.value, description: config.description },
      create: {
        key: config.key,
        value: config.value,
        description: config.description,
      },
    });
  }

  console.log(`   ✓ Created ${configs.length} system configurations`);
}

async function seedTenants() {
  console.log('🏢 Seeding tenants...');

  const tenants = [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'TenderFlow Demo Corp',
      subdomain: 'demo',
      settings: {
        features: ['document_parsing', 'advanced_analytics', 'api_access'],
        limits: { users: 50, tenders_per_month: 100, storage_gb: 10 },
        branding: { logo_url: '/assets/demo-logo.png', primary_color: '#007bff' },
      },
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      name: 'Construction Solutions Ltd',
      subdomain: 'construction',
      settings: {
        features: ['document_parsing', 'compliance_tracking'],
        limits: { users: 25, tenders_per_month: 50, storage_gb: 5 },
        branding: { logo_url: '/assets/construction-logo.png', primary_color: '#28a745' },
      },
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440003',
      name: 'IT Services Inc',
      subdomain: 'itservices',
      settings: {
        features: ['advanced_analytics', 'api_access', 'custom_integrations'],
        limits: { users: 100, tenders_per_month: 200, storage_gb: 25 },
        branding: { logo_url: '/assets/it-logo.png', primary_color: '#6f42c1' },
      },
    },
  ];

  const createdTenants = [];
  for (const tenant of tenants) {
    const created = await prisma.tenant.upsert({
      where: { id: tenant.id },
      update: tenant,
      create: tenant,
    });
    createdTenants.push(created);
  }

  console.log(`   ✓ Created ${createdTenants.length} tenants`);
  return createdTenants;
}

async function seedUsers(tenants: any[]) {
  console.log('👥 Seeding users...');

  const hashedPassword = await bcrypt.hash('password123', 10);
  
  const users = [];
  
  for (const tenant of tenants) {
    const tenantUsers = [
      {
        id: `user-${tenant.subdomain}-admin`,
        tenantId: tenant.id,
        email: `admin@${tenant.subdomain}.tenderflow.com`,
        firstName: 'Admin',
        lastName: 'User',
        role: UserRole.admin,
        settings: {
          timezone: 'UTC',
          notifications: { email: true, push: true },
          dashboard_preferences: { default_view: 'grid', items_per_page: 25 },
        },
      },
      {
        id: `user-${tenant.subdomain}-manager`,
        tenantId: tenant.id,
        email: `manager@${tenant.subdomain}.tenderflow.com`,
        firstName: 'Manager',
        lastName: 'User',
        role: UserRole.member,
        settings: {
          timezone: 'UTC',
          notifications: { email: true, push: false },
          dashboard_preferences: { default_view: 'list', items_per_page: 50 },
        },
      },
      {
        id: `user-${tenant.subdomain}-member1`,
        tenantId: tenant.id,
        email: `member1@${tenant.subdomain}.tenderflow.com`,
        firstName: 'Member',
        lastName: 'One',
        role: UserRole.member,
        settings: {
          timezone: 'America/New_York',
          notifications: { email: true, push: true },
        },
      },
      {
        id: `user-${tenant.subdomain}-member2`,
        tenantId: tenant.id,
        email: `member2@${tenant.subdomain}.tenderflow.com`,
        firstName: 'Member',
        lastName: 'Two',
        role: UserRole.member,
        settings: {
          timezone: 'Europe/London',
          notifications: { email: false, push: true },
        },
      },
      {
        id: `user-${tenant.subdomain}-viewer`,
        tenantId: tenant.id,
        email: `viewer@${tenant.subdomain}.tenderflow.com`,
        firstName: 'Viewer',
        lastName: 'User',
        role: UserRole.viewer,
        settings: {
          timezone: 'UTC',
          notifications: { email: false, push: false },
        },
      },
    ];

    for (const user of tenantUsers) {
      const created = await prisma.user.upsert({
        where: { id: user.id },
        update: user,
        create: user,
      });
      users.push(created);
    }
  }

  console.log(`   ✓ Created ${users.length} users`);
  return users;
}

async function seedTenders(tenants: any[], users: any[]) {
  console.log('📋 Seeding tenders...');

  const tenders = [];
  const categories = Object.values(TenderCategory);
  const statuses = Object.values(TenderStatus);

  for (const tenant of tenants) {
    const tenantUsers = users.filter(u => u.tenantId === tenant.id);
    const admin = tenantUsers.find(u => u.role === UserRole.admin);

    const tenantTenders = [
      {
        id: `tender-${tenant.subdomain}-001`,
        tenantId: tenant.id,
        title: 'Enterprise Software Development Project',
        description: 'Development of a comprehensive enterprise software solution for inventory management and customer relationship management.',
        status: TenderStatus.IN_BID,
        category: TenderCategory.IT_SERVICES,
        publishedAt: new Date('2024-01-15T09:00:00Z'),
        deadline: new Date('2024-02-15T17:00:00Z'),
        estimatedValue: 250000.00,
        currency: 'USD',
        source: 'procurement.gov',
        externalId: 'GOV-2024-IT-001',
        metadata: {
          procurement_method: 'open_tender',
          evaluation_criteria: ['technical_capability', 'price', 'timeline'],
          contact_person: 'Jane Smith',
          contact_email: 'jane.smith@procurement.gov',
        },
        requirements: {
          technical: {
            technologies: ['React', 'Node.js', 'PostgreSQL', 'Docker'],
            experience_years: 5,
            team_size: 8,
          },
          commercial: {
            payment_terms: 'Net 30',
            delivery_timeline: '6 months',
            warranty_period: '12 months',
          },
          legal: {
            insurance_required: true,
            security_clearance: false,
            intellectual_property: 'client_owned',
          },
        },
        createdBy: admin.id,
      },
      {
        id: `tender-${tenant.subdomain}-002`,
        tenantId: tenant.id,
        title: 'Office Building Construction',
        description: 'Construction of a modern 5-story office building with sustainable design features and LEED certification requirements.',
        status: TenderStatus.QUALIFIED,
        category: TenderCategory.CONSTRUCTION,
        publishedAt: new Date('2024-01-20T08:00:00Z'),
        deadline: new Date('2024-03-01T16:00:00Z'),
        estimatedValue: 2500000.00,
        currency: 'USD',
        source: 'citywide_tenders',
        externalId: 'CITY-2024-CONST-002',
        metadata: {
          location: 'Downtown Business District',
          building_type: 'commercial_office',
          certification_required: 'LEED Gold',
        },
        requirements: {
          technical: {
            construction_type: 'steel_frame',
            floors: 5,
            total_area_sqft: 50000,
            parking_spaces: 100,
          },
          commercial: {
            completion_timeline: '18 months',
            payment_schedule: 'milestone_based',
            retention_percentage: 10,
          },
          legal: {
            bonding_required: true,
            insurance_minimum: 5000000,
            prevailing_wage: true,
          },
        },
        createdBy: admin.id,
      },
      {
        id: `tender-${tenant.subdomain}-003`,
        tenantId: tenant.id,
        title: 'Management Consulting Services',
        description: 'Strategic consulting services for digital transformation and process optimization across multiple departments.',
        status: TenderStatus.SUBMITTED,
        category: TenderCategory.CONSULTING,
        publishedAt: new Date('2024-02-01T10:00:00Z'),
        deadline: new Date('2024-02-28T15:00:00Z'),
        estimatedValue: 150000.00,
        currency: 'USD',
        source: 'direct_award',
        externalId: 'DA-2024-CONS-003',
        metadata: {
          departments: ['HR', 'Finance', 'Operations'],
          methodology: 'Agile transformation',
          expected_duration: '4 months',
        },
        requirements: {
          technical: {
            methodologies: ['Lean Six Sigma', 'Agile', 'Change Management'],
            consultant_experience: 10,
            certifications: ['PMP', 'Lean Six Sigma Black Belt'],
          },
          commercial: {
            hourly_rates: true,
            travel_expenses: 'reimbursable',
            deliverables: ['assessment_report', 'implementation_plan', 'training_materials'],
          },
        },
        createdBy: admin.id,
      },
      {
        id: `tender-${tenant.subdomain}-004`,
        tenantId: tenant.id,
        title: 'Medical Equipment Supply',
        description: 'Supply and installation of advanced medical equipment for the new healthcare facility.',
        status: TenderStatus.WON,
        category: TenderCategory.SUPPLIES,
        publishedAt: new Date('2024-01-05T07:00:00Z'),
        deadline: new Date('2024-01-25T14:00:00Z'),
        estimatedValue: 750000.00,
        currency: 'USD',
        source: 'healthcare_procurement',
        externalId: 'HP-2024-EQUIP-004',
        metadata: {
          facility_type: 'outpatient_clinic',
          equipment_categories: ['imaging', 'laboratory', 'patient_monitoring'],
          installation_required: true,
        },
        requirements: {
          technical: {
            fda_approved: true,
            warranty_years: 3,
            training_included: true,
            maintenance_contract: 'optional',
          },
          commercial: {
            delivery_timeline: '8 weeks',
            installation_timeline: '2 weeks',
            payment_terms: '50% upfront, 50% on completion',
          },
        },
        createdBy: admin.id,
      },
      {
        id: `tender-${tenant.subdomain}-005`,
        tenantId: tenant.id,
        title: 'Research and Development Services',
        description: 'Advanced research services for developing next-generation renewable energy solutions.',
        status: TenderStatus.SCRAPED,
        category: TenderCategory.RESEARCH,
        publishedAt: new Date('2024-02-10T11:00:00Z'),
        deadline: new Date('2024-03-15T16:00:00Z'),
        estimatedValue: 500000.00,
        currency: 'USD',
        source: 'research_portal',
        externalId: 'RP-2024-RND-005',
        metadata: {
          research_area: 'renewable_energy',
          collaboration_required: true,
          publication_rights: 'shared',
        },
        requirements: {
          technical: {
            phd_researchers: 3,
            laboratory_access: true,
            publications_required: 5,
            patent_applications: 2,
          },
          commercial: {
            duration_months: 24,
            milestone_payments: true,
            ip_sharing: '60/40',
          },
        },
        createdBy: admin.id,
      },
    ];

    for (const tender of tenantTenders) {
      const created = await prisma.tender.upsert({
        where: { id: tender.id },
        update: tender,
        create: tender,
      });
      tenders.push(created);
    }
  }

  console.log(`   ✓ Created ${tenders.length} tenders`);
  return tenders;
}

async function seedTenderAssignments(tenders: any[], users: any[]) {
  console.log('👤 Seeding tender assignments...');

  const assignments = [];

  for (const tender of tenders) {
    const tenantUsers = users.filter(u => u.tenantId === tender.tenantId);
    const admin = tenantUsers.find(u => u.role === UserRole.admin);
    const members = tenantUsers.filter(u => u.role === UserRole.member);
    const viewer = tenantUsers.find(u => u.role === UserRole.viewer);

    // Assign owner (admin or first member)
    const owner = admin || members[0];
    if (owner) {
      assignments.push({
        tenderId: tender.id,
        userId: owner.id,
        role: TenderRole.owner,
      });
    }

    // Assign contributors (remaining members)
    const contributors = members.slice(owner === admin ? 0 : 1, 3);
    for (const contributor of contributors) {
      assignments.push({
        tenderId: tender.id,
        userId: contributor.id,
        role: TenderRole.contributor,
      });
    }

    // Assign viewer if exists
    if (viewer) {
      assignments.push({
        tenderId: tender.id,
        userId: viewer.id,
        role: TenderRole.viewer,
      });
    }
  }

  for (const assignment of assignments) {
    await prisma.tenderAssignment.upsert({
      where: {
        tenderId_userId: {
          tenderId: assignment.tenderId,
          userId: assignment.userId,
        },
      },
      update: assignment,
      create: assignment,
    });
  }

  console.log(`   ✓ Created ${assignments.length} tender assignments`);
}

async function seedBids(tenders: any[], users: any[]) {
  console.log('💰 Seeding bids...');

  const bids = [];

  for (const tender of tenders) {
    if ([TenderStatus.IN_BID, TenderStatus.SUBMITTED, TenderStatus.WON].includes(tender.status)) {
      const tenantUsers = users.filter(u => u.tenantId === tender.tenantId);
      const owner = tenantUsers.find(u => u.role === UserRole.admin) || tenantUsers[0];

      const bid = {
        tenderId: tender.id,
        ownerId: owner.id,
        totalAmount: tender.estimatedValue * (0.9 + Math.random() * 0.2), // 90-110% of estimated
        currency: tender.currency,
        tasks: {
          technical: {
            requirements_analysis: true,
            system_design: true,
            implementation: true,
            testing: true,
            deployment: true,
            documentation: true,
          },
          completed_percentage: Math.random() * 100,
        },
        timeline: {
          phases: [
            { name: 'Analysis', duration_weeks: 2, start_week: 1 },
            { name: 'Design', duration_weeks: 3, start_week: 3 },
            { name: 'Implementation', duration_weeks: 8, start_week: 6 },
            { name: 'Testing', duration_weeks: 2, start_week: 14 },
            { name: 'Deployment', duration_weeks: 1, start_week: 16 },
          ],
          total_duration_weeks: 16,
        },
        methodology: {
          approach: 'Agile with Scrum methodology',
          sprint_length: '2 weeks',
          deliverables_per_sprint: true,
          stakeholder_involvement: 'continuous',
        },
        team: {
          project_manager: 1,
          senior_developers: 2,
          developers: 3,
          qa_engineers: 1,
          devops_engineer: 1,
          total_team_size: 8,
        },
        assumptions: [
          'Client provides timely feedback and approvals',
          'Required infrastructure will be available',
          'No major scope changes after project start',
          'Access to necessary stakeholders when needed',
        ],
        riskAssessment: {
          technical_risks: ['Integration complexity', 'Data migration challenges'],
          business_risks: ['Scope creep', 'Resource availability'],
          mitigation_strategies: ['Regular checkpoints', 'Prototype validation'],
          risk_level: 'medium',
        },
        qualityPlan: {
          code_review_process: true,
          automated_testing: true,
          user_acceptance_testing: true,
          performance_testing: true,
          security_review: true,
        },
        deliverables: [
          'Requirements specification document',
          'System architecture diagram',
          'Source code with documentation',
          'Test cases and results',
          'User manuals and training materials',
          'Deployment guide',
        ],
        notes: 'This bid represents our comprehensive understanding of the project requirements and our commitment to delivering a high-quality solution.',
        isSubmitted: [TenderStatus.SUBMITTED, TenderStatus.WON].includes(tender.status),
        submittedAt: [TenderStatus.SUBMITTED, TenderStatus.WON].includes(tender.status)
          ? new Date(tender.deadline.getTime() - 24 * 60 * 60 * 1000) // 1 day before deadline
          : null,
      };

      const created = await prisma.bid.upsert({
        where: { tenderId: tender.id },
        update: bid,
        create: bid,
      });
      bids.push(created);
    }
  }

  console.log(`   ✓ Created ${bids.length} bids`);
  return bids;
}

async function seedDocuments(tenders: any[], users: any[]) {
  console.log('📄 Seeding documents...');

  const documents = [];
  const documentTypes = Object.values(DocumentType);

  for (const tender of tenders) {
    const tenantUsers = users.filter(u => u.tenantId === tender.tenantId);
    const uploader = tenantUsers[Math.floor(Math.random() * tenantUsers.length)];

    const tenderDocuments = [
      {
        tenderId: tender.id,
        uploadedBy: uploader.id,
        filename: `rfp-${tender.id}.pdf`,
        originalName: 'Request for Proposal.pdf',
        mimeType: 'application/pdf',
        size: 2048576, // 2MB
        s3Key: `documents/tender-${tender.id}/rfp-${Date.now()}.pdf`,
        s3Bucket: 'tenderflow-documents',
        type: DocumentType.RFP,
        metadata: {
          pages: 25,
          language: 'en',
          extracted_text_length: 15000,
          has_tables: true,
          has_images: false,
        },
      },
      {
        tenderId: tender.id,
        uploadedBy: uploader.id,
        filename: `technical-spec-${tender.id}.docx`,
        originalName: 'Technical Specifications.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 1536000, // 1.5MB
        s3Key: `documents/tender-${tender.id}/tech-spec-${Date.now()}.docx`,
        s3Bucket: 'tenderflow-documents',
        type: DocumentType.TECHNICAL_SPEC,
        metadata: {
          pages: 18,
          language: 'en',
          word_count: 8500,
          has_diagrams: true,
        },
      },
    ];

    // Add submission documents for submitted tenders
    if ([TenderStatus.SUBMITTED, TenderStatus.WON, TenderStatus.LOST].includes(tender.status)) {
      tenderDocuments.push({
        tenderId: tender.id,
        uploadedBy: uploader.id,
        filename: `submission-${tender.id}.pdf`,
        originalName: 'Final Submission.pdf',
        mimeType: 'application/pdf',
        size: 5242880, // 5MB
        s3Key: `documents/tender-${tender.id}/submission-${Date.now()}.pdf`,
        s3Bucket: 'tenderflow-documents',
        type: DocumentType.SUBMISSION,
        metadata: {
          pages: 45,
          language: 'en',
          contains_pricing: true,
          digitally_signed: true,
        },
      });
    }

    for (const doc of tenderDocuments) {
      const created = await prisma.document.create({
        data: doc,
      });
      documents.push(created);
    }
  }

  console.log(`   ✓ Created ${documents.length} documents`);
  return documents;
}

async function seedSubmissions(tenders: any[], users: any[]) {
  console.log('📤 Seeding submissions...');

  const submissions = [];

  for (const tender of tenders) {
    if ([TenderStatus.SUBMITTED, TenderStatus.WON, TenderStatus.LOST].includes(tender.status)) {
      const tenantUsers = users.filter(u => u.tenantId === tender.tenantId);
      const submitter = tenantUsers.find(u => u.role === UserRole.admin) || tenantUsers[0];

      const submission = {
        tenderId: tender.id,
        method: 'PORTAL' as const,
        submittedAt: new Date(tender.deadline.getTime() - 2 * 60 * 60 * 1000), // 2 hours before deadline
        submittedBy: submitter.id,
        externalRef: `SUB-${tender.externalId}-${Date.now()}`,
        receiptKey: `receipts/tender-${tender.id}/receipt-${Date.now()}.pdf`,
        parsed: {
          portal: tender.source || 'unknown_portal',
          receiptNumber: `RCP-${tender.externalId}`,
          portalSubmissionId: `${Math.floor(Math.random() * 1000000000)}`,
          account: `bidder_${tender.tenantId}`,
          submittedAt: new Date(tender.deadline.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          amount: { 
            value: tender.estimatedValue * (0.9 + Math.random() * 0.2), 
            currency: tender.currency 
          },
          links: { 
            portal: `https://${tender.source}/submissions/${Math.floor(Math.random() * 1000000)}` 
          },
          status: tender.status === TenderStatus.WON ? 'accepted' : 
                  tender.status === TenderStatus.LOST ? 'rejected' : 'under_review',
        },
        parsedAt: new Date(),
        parseVersion: '1.0.0',
        amount: tender.estimatedValue * (0.9 + Math.random() * 0.2),
        currency: tender.currency,
        status: tender.status === TenderStatus.WON ? 'accepted' : 
                tender.status === TenderStatus.LOST ? 'rejected' : 'submitted',
        portalData: {
          submission_time: new Date(tender.deadline.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          file_count: 5,
          total_size_mb: 25.5,
          confirmation_code: `CONF-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        },
        notes: tender.status === TenderStatus.WON 
          ? 'Submission accepted. Congratulations on winning this tender!'
          : tender.status === TenderStatus.LOST
          ? 'Submission was not selected. Thank you for your participation.'
          : 'Submission received and is under review.',
      };

      const created = await prisma.submission.create({
        data: submission,
      });
      submissions.push(created);
    }
  }

  console.log(`   ✓ Created ${submissions.length} submissions`);
  return submissions;
}

async function seedValidations(tenders: any[]) {
  console.log('✅ Seeding validations...');

  const validations = [];

  for (const tender of tenders) {
    if ([TenderStatus.VALIDATED, TenderStatus.QUALIFIED, TenderStatus.IN_BID, TenderStatus.SUBMITTED, TenderStatus.WON, TenderStatus.LOST].includes(tender.status)) {
      const validation = {
        tenderId: tender.id,
        criteria: {
          eligibility: {
            business_registration: true,
            financial_capacity: true,
            technical_capability: true,
            past_performance: true,
            score: 85,
          },
          requirements: {
            mandatory_documents: true,
            technical_specifications: true,
            commercial_terms: true,
            legal_compliance: true,
            score: 92,
          },
          evaluation: {
            technical_score: 88,
            commercial_score: 85,
            overall_score: 86.5,
            ranking: Math.floor(Math.random() * 5) + 1,
          },
        },
        score: 86.5,
        isValid: true,
        validatedAt: new Date(tender.createdAt.getTime() + 24 * 60 * 60 * 1000), // 1 day after creation
        notes: 'Tender meets all eligibility criteria and requirements. Recommended to proceed to bidding phase.',
      };

      const created = await prisma.tenderValidation.create({
        data: validation,
      });
      validations.push(created);
    }
  }

  console.log(`   ✓ Created ${validations.length} validations`);
  return validations;
}

async function seedStateTransitions(tenders: any[], users: any[]) {
  console.log('🔄 Seeding state transitions...');

  const transitions = [];

  for (const tender of tenders) {
    const tenantUsers = users.filter(u => u.tenantId === tender.tenantId);
    const admin = tenantUsers.find(u => u.role === UserRole.admin) || tenantUsers[0];

    const statusFlow = [
      TenderStatus.SCRAPED,
      TenderStatus.VALIDATED,
      TenderStatus.QUALIFIED,
      TenderStatus.IN_BID,
      TenderStatus.SUBMITTED,
      tender.status === TenderStatus.WON ? TenderStatus.WON : 
      tender.status === TenderStatus.LOST ? TenderStatus.LOST : null
    ].filter(status => status !== null);

    const currentIndex = statusFlow.indexOf(tender.status);
    
    for (let i = 0; i <= currentIndex; i++) {
      const transition = {
        tenderId: tender.id,
        fromStatus: i === 0 ? null : statusFlow[i - 1],
        toStatus: statusFlow[i],
        triggeredBy: admin.id,
        reason: getTransitionReason(statusFlow[i]),
        metadata: {
          automated: i === 0, // First transition (SCRAPED) is automated
          validation_score: i >= 1 ? 86.5 : null,
          bid_amount: i >= 3 ? tender.estimatedValue * 0.95 : null,
        },
        createdAt: new Date(tender.createdAt.getTime() + i * 24 * 60 * 60 * 1000), // Daily progressions
      };

      transitions.push(transition);
    }
  }

  for (const transition of transitions) {
    await prisma.stateTransition.create({
      data: transition,
    });
  }

  console.log(`   ✓ Created ${transitions.length} state transitions`);
  return transitions;
}

function getTransitionReason(status: TenderStatus): string {
  switch (status) {
    case TenderStatus.SCRAPED:
      return 'Tender automatically imported from external portal';
    case TenderStatus.VALIDATED:
      return 'Initial validation completed successfully';
    case TenderStatus.QUALIFIED:
      return 'Tender qualified based on eligibility criteria';
    case TenderStatus.IN_BID:
      return 'Bidding process initiated';
    case TenderStatus.SUBMITTED:
      return 'Bid submitted successfully before deadline';
    case TenderStatus.WON:
      return 'Tender awarded - congratulations!';
    case TenderStatus.LOST:
      return 'Tender not awarded - better luck next time';
    case TenderStatus.ARCHIVED:
      return 'Tender archived after completion';
    default:
      return 'Status updated';
  }
}

async function seedComments(tenders: any[], users: any[]) {
  console.log('💬 Seeding comments...');

  const comments = [];

  for (const tender of tenders) {
    const tenantUsers = users.filter(u => u.tenantId === tender.tenantId);
    const commentCount = Math.floor(Math.random() * 5) + 1; // 1-5 comments per tender

    for (let i = 0; i < commentCount; i++) {
      const author = tenantUsers[Math.floor(Math.random() * tenantUsers.length)];
      
      const comment = {
        tenderId: tender.id,
        authorId: author.id,
        content: getRandomComment(i, tender.status),
        metadata: {
          edited: Math.random() > 0.8,
          mentions: Math.random() > 0.7 ? [tenantUsers[0].id] : [],
        },
        createdAt: new Date(tender.createdAt.getTime() + (i + 1) * 12 * 60 * 60 * 1000), // Every 12 hours
      };

      comments.push(comment);
    }
  }

  for (const comment of comments) {
    await prisma.comment.create({
      data: comment,
    });
  }

  console.log(`   ✓ Created ${comments.length} comments`);
  return comments;
}

function getRandomComment(index: number, tenderStatus: TenderStatus): string {
  const comments = [
    'Initial review looks promising. Need to analyze technical requirements in detail.',
    'I\'ve reviewed the RFP and identified potential challenges with the timeline.',
    'Our team has the right expertise for this project. Let\'s prepare a competitive bid.',
    'Updated the bid with latest pricing from our vendors.',
    'Final review completed. Ready for submission.',
    'Submission successful! Now we wait for the results.',
    'Great work everyone! This was a team effort.',
    'Let\'s analyze what we can improve for next time.',
  ];

  const statusSpecificComments = {
    [TenderStatus.SCRAPED]: [
      'New tender identified. Starting initial assessment.',
      'Looks like a good opportunity. Let\'s evaluate our fit.',
    ],
    [TenderStatus.QUALIFIED]: [
      'Qualification criteria met. Moving forward with bid preparation.',
      'Technical requirements align well with our capabilities.',
    ],
    [TenderStatus.WON]: [
      'Excellent news! We won this tender.',
      'Congratulations to the entire team!',
    ],
    [TenderStatus.LOST]: [
      'Unfortunately, we weren\'t selected this time.',
      'Let\'s review feedback and improve for next time.',
    ],
  };

  const specificComments = statusSpecificComments[tenderStatus] || [];
  const allComments = [...comments, ...specificComments];
  
  return allComments[Math.min(index, allComments.length - 1)];
}

async function seedNotifications(users: any[], tenders: any[]) {
  console.log('🔔 Seeding notifications...');

  const notifications = [];

  for (const user of users) {
    const userTenders = tenders.filter(t => t.tenantId === user.tenantId).slice(0, 3); // Max 3 per user
    
    for (const tender of userTenders) {
      const notification = {
        userId: user.id,
        tenderId: tender.id,
        type: getRandomNotificationType(tender.status),
        title: getNotificationTitle(tender.status, tender.title),
        message: getNotificationMessage(tender.status, tender.title),
        data: {
          tenderId: tender.id,
          tenderTitle: tender.title,
          deadline: tender.deadline,
          status: tender.status,
        },
        isRead: Math.random() > 0.3, // 70% read rate
        readAt: Math.random() > 0.3 ? new Date() : null,
        createdAt: new Date(tender.updatedAt.getTime() + Math.random() * 60 * 60 * 1000), // Within 1 hour of tender update
      };

      notifications.push(notification);
    }
  }

  for (const notification of notifications) {
    await prisma.notification.create({
      data: notification,
    });
  }

  console.log(`   ✓ Created ${notifications.length} notifications`);
  return notifications;
}

function getRandomNotificationType(status: TenderStatus) {
  const typeMap = {
    [TenderStatus.SCRAPED]: 'SYSTEM_ALERT',
    [TenderStatus.VALIDATED]: 'TENDER_STATUS_CHANGED',
    [TenderStatus.QUALIFIED]: 'TENDER_ASSIGNED',
    [TenderStatus.IN_BID]: 'BID_UPDATED',
    [TenderStatus.SUBMITTED]: 'SUBMISSION_DUE',
    [TenderStatus.WON]: 'TENDER_STATUS_CHANGED',
    [TenderStatus.LOST]: 'TENDER_STATUS_CHANGED',
  };
  
  return typeMap[status] || 'SYSTEM_ALERT';
}

function getNotificationTitle(status: TenderStatus, tenderTitle: string): string {
  switch (status) {
    case TenderStatus.SCRAPED:
      return 'New Tender Available';
    case TenderStatus.QUALIFIED:
      return 'Tender Assigned to You';
    case TenderStatus.IN_BID:
      return 'Bidding Phase Started';
    case TenderStatus.SUBMITTED:
      return 'Submission Confirmed';
    case TenderStatus.WON:
      return 'Congratulations - Tender Won!';
    case TenderStatus.LOST:
      return 'Tender Result - Not Selected';
    default:
      return 'Tender Status Updated';
  }
}

function getNotificationMessage(status: TenderStatus, tenderTitle: string): string {
  switch (status) {
    case TenderStatus.SCRAPED:
      return `New tender "${tenderTitle}" has been identified and imported.`;
    case TenderStatus.QUALIFIED:
      return `You have been assigned to work on tender "${tenderTitle}".`;
    case TenderStatus.IN_BID:
      return `Bidding phase has started for "${tenderTitle}". Time to prepare your proposal.`;
    case TenderStatus.SUBMITTED:
      return `Your submission for "${tenderTitle}" has been confirmed.`;
    case TenderStatus.WON:
      return `Great news! You have won the tender "${tenderTitle}".`;
    case TenderStatus.LOST:
      return `The tender "${tenderTitle}" was not awarded to you. Keep up the good work for future opportunities.`;
    default:
      return `Status updated for tender "${tenderTitle}".`;
  }
}

async function seedAuditLogs(tenants: any[], users: any[]) {
  console.log('📋 Seeding audit logs...');

  const auditLogs = [];

  for (const user of users) {
    const tenant = tenants.find(t => t.id === user.tenantId);
    
    // Login events
    for (let i = 0; i < 5; i++) {
      auditLogs.push({
        tenantId: tenant.id,
        userId: user.id,
        action: 'LOGIN',
        resource: 'user',
        resourceId: user.id,
        metadata: {
          ip_address: `192.168.1.${Math.floor(Math.random() * 255)}`,
          user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          session_id: `sess_${Math.random().toString(36).substring(2)}`,
        },
        ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Last 7 days
      });
    }

    // Tender operations
    auditLogs.push({
      tenantId: tenant.id,
      userId: user.id,
      action: 'VIEW',
      resource: 'tender',
      resourceId: `tender-${tenant.subdomain}-001`,
      metadata: {
        view_duration_seconds: Math.floor(Math.random() * 600) + 30,
        page: 'tender_detail',
      },
      timestamp: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000), // Last 24 hours
    });
  }

  for (const auditLog of auditLogs) {
    await prisma.auditLog.create({
      data: auditLog,
    });
  }

  console.log(`   ✓ Created ${auditLogs.length} audit logs`);
  return auditLogs;
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });