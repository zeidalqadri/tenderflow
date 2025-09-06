import { PrismaClient } from '../src/generated/prisma';
import { TenderStatus, TenderCategory, UserRole, TenderRole, DocumentType, SubmissionMethod, NotificationType, AuditAction } from '../src/generated/prisma';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting comprehensive database seeding...');

  // Skip cleaning for fresh database
  console.log('🧹 Using fresh database - no cleanup needed...');

  // Hash default password for all test users
  const defaultPassword = 'password123';
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);
  console.log('🔐 Default password for all test users: password123');

  // Create tenants
  console.log('🏢 Creating tenants...');
  
  // Create development tenant (used by auth bypass)
  const devTenant = await prisma.tenant.create({
    data: {
      id: 'dev-tenant-001', // Specific ID for development auth bypass
      name: 'Development Tenant',
      subdomain: 'dev',
      settings: {
        timezone: 'UTC',
        currency: 'USD',
        autoAssignTenders: true,
        emailNotifications: false
      },
      isActive: true
    }
  });
  
  const tenant1 = await prisma.tenant.create({
    data: {
      name: 'TechCorp Solutions',
      subdomain: 'techcorp',
      settings: {
        timezone: 'UTC',
        currency: 'USD',
        autoAssignTenders: true,
        emailNotifications: true
      },
      isActive: true
    }
  });

  const tenant2 = await prisma.tenant.create({
    data: {
      name: 'Global Consulting',
      subdomain: 'globalconsulting',
      settings: {
        timezone: 'EST',
        currency: 'USD',
        autoAssignTenders: false,
        emailNotifications: true
      },
      isActive: true
    }
  });

  // Create users for tenant1
  console.log('👥 Creating users...');
  
  // Create development user (used by auth bypass)
  const devUser = await prisma.user.create({
    data: {
      id: 'dev-user-001', // Specific ID for development auth bypass
      tenantId: devTenant.id,
      email: 'dev@tenderflow.com',
      passwordHash: await bcrypt.hash('dev123', 10),
      firstName: 'Dev',
      lastName: 'User',
      role: UserRole.admin,
      isActive: true,
      settings: {
        emailPreferences: {
          tenderAssigned: false,
          statusChanges: false,
          deadlineReminders: false
        }
      }
    }
  });
  
  // Create demo admin user for easy testing
  const demoAdmin = await prisma.user.create({
    data: {
      tenantId: tenant1.id,
      email: 'admin@tenderflow.com',
      passwordHash: await bcrypt.hash('admin123', 10),
      firstName: 'Demo',
      lastName: 'Admin',
      role: UserRole.admin,
      isActive: true,
      settings: {
        emailPreferences: {
          tenderAssigned: true,
          statusChanges: true,
          deadlineReminders: true
        }
      }
    }
  });
  
  const adminUser = await prisma.user.create({
    data: {
      tenantId: tenant1.id,
      email: 'admin@techcorp.com',
      passwordHash: hashedPassword,
      firstName: 'Sarah',
      lastName: 'Johnson',
      role: UserRole.admin,
      isActive: true,
      settings: {
        emailPreferences: {
          tenderAssigned: true,
          statusChanges: true,
          deadlineReminders: true
        }
      }
    }
  });

  const memberUser1 = await prisma.user.create({
    data: {
      tenantId: tenant1.id,
      email: 'john.smith@techcorp.com',
      passwordHash: hashedPassword,
      firstName: 'John',
      lastName: 'Smith',
      role: UserRole.member,
      isActive: true,
      settings: {
        emailPreferences: {
          tenderAssigned: true,
          statusChanges: false,
          deadlineReminders: true
        }
      }
    }
  });

  const memberUser2 = await prisma.user.create({
    data: {
      tenantId: tenant1.id,
      email: 'emma.wilson@techcorp.com',
      passwordHash: hashedPassword,
      firstName: 'Emma',
      lastName: 'Wilson',
      role: UserRole.member,
      isActive: true,
      settings: {
        emailPreferences: {
          tenderAssigned: true,
          statusChanges: true,
          deadlineReminders: true
        }
      }
    }
  });

  const viewerUser = await prisma.user.create({
    data: {
      tenantId: tenant1.id,
      email: 'viewer@techcorp.com',
      passwordHash: hashedPassword,
      firstName: 'Mike',
      lastName: 'Brown',
      role: UserRole.viewer,
      isActive: true,
      settings: {}
    }
  });

  // Create users for tenant2
  const tenant2Admin = await prisma.user.create({
    data: {
      tenantId: tenant2.id,
      email: 'admin@globalconsulting.com',
      passwordHash: hashedPassword,
      firstName: 'Lisa',
      lastName: 'Davis',
      role: UserRole.admin,
      isActive: true,
      settings: {}
    }
  });

  // Create sample tenders
  console.log('📋 Creating tenders...');
  const currentDate = new Date();
  const futureDate = new Date();
  futureDate.setDate(currentDate.getDate() + 30);

  const tender1 = await prisma.tender.create({
    data: {
      tenantId: tenant1.id,
      title: 'Cloud Infrastructure Migration Project',
      description: 'Complete migration of on-premises infrastructure to AWS cloud platform including database migration, application refactoring, and security implementation.',
      status: TenderStatus.QUALIFIED,
      category: TenderCategory.IT_SERVICES,
      publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      deadline: futureDate,
      estimatedValue: 125000.00,
      currency: 'USD',
      source: 'Government Portal',
      externalId: 'GOV-2024-IT-001',
      metadata: {
        location: 'Washington, DC',
        duration: '6 months',
        securityClearance: 'Required',
        technologies: ['AWS', 'PostgreSQL', 'Docker', 'Kubernetes']
      },
      requirements: {
        technical: {
          experience: '5+ years cloud migration',
          certifications: ['AWS Solutions Architect', 'AWS DevOps Engineer'],
          teamSize: '4-6 engineers'
        },
        compliance: ['SOC2', 'FedRAMP'],
        deliverables: ['Migration Plan', 'Security Assessment', 'Training Materials']
      },
      createdBy: adminUser.id
    }
  });

  const tender2 = await prisma.tender.create({
    data: {
      tenantId: tenant1.id,
      title: 'Enterprise Software Development',
      description: 'Development of a comprehensive customer relationship management system with advanced analytics and reporting capabilities.',
      status: TenderStatus.IN_BID,
      category: TenderCategory.IT_SERVICES,
      publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      deadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // 21 days from now
      estimatedValue: 250000.00,
      currency: 'USD',
      source: 'Private RFP',
      externalId: 'CORP-2024-DEV-002',
      metadata: {
        location: 'Remote',
        duration: '12 months',
        integrations: ['Salesforce', 'HubSpot', 'Microsoft 365']
      },
      requirements: {
        technical: {
          experience: '7+ years enterprise software',
          technologies: ['React', 'Node.js', 'PostgreSQL', 'GraphQL'],
          methodology: 'Agile/Scrum'
        },
        deliverables: ['Source Code', 'Documentation', 'Training', 'Support']
      },
      createdBy: adminUser.id
    }
  });

  const tender3 = await prisma.tender.create({
    data: {
      tenantId: tenant1.id,
      title: 'Data Center Security Consulting',
      description: 'Comprehensive security assessment and implementation of advanced security measures for enterprise data center facilities.',
      status: TenderStatus.SCRAPED,
      category: TenderCategory.CONSULTING,
      publishedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 45 days from now
      estimatedValue: 75000.00,
      currency: 'USD',
      source: 'Industry Portal',
      externalId: 'IND-2024-SEC-003',
      metadata: {
        location: 'New York, NY',
        duration: '3 months',
        clearanceRequired: true
      },
      requirements: {
        technical: {
          experience: '10+ years cybersecurity',
          certifications: ['CISSP', 'CISM', 'CEH'],
          specialties: ['Penetration Testing', 'Risk Assessment', 'Compliance']
        }
      },
      createdBy: memberUser1.id
    }
  });

  const tender4 = await prisma.tender.create({
    data: {
      tenantId: tenant1.id,
      title: 'Office Building Construction Management',
      description: 'Project management services for the construction of a 15-story office building including coordination with contractors, scheduling, and quality control.',
      status: TenderStatus.SUBMITTED,
      category: TenderCategory.CONSTRUCTION,
      publishedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 14 days ago
      deadline: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago (overdue)
      estimatedValue: 500000.00,
      currency: 'USD',
      source: 'Municipal Portal',
      externalId: 'MUN-2024-CONST-004',
      metadata: {
        location: 'Chicago, IL',
        duration: '18 months',
        buildingType: 'Commercial Office',
        floors: 15,
        sqft: 150000
      },
      requirements: {
        technical: {
          experience: '15+ years construction management',
          licenses: ['Professional Engineer', 'Project Management Professional'],
          insurance: '$5M liability coverage'
        }
      },
      createdBy: memberUser2.id
    }
  });

  const tender5 = await prisma.tender.create({
    data: {
      tenantId: tenant2.id,
      title: 'Digital Transformation Strategy',
      description: 'Strategic consulting for digital transformation including process optimization, technology roadmap, and change management.',
      status: TenderStatus.VALIDATED,
      category: TenderCategory.CONSULTING,
      publishedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      deadline: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000), // 35 days from now
      estimatedValue: 180000.00,
      currency: 'USD',
      source: 'Enterprise RFP',
      externalId: 'ENT-2024-STRAT-005',
      metadata: {
        location: 'San Francisco, CA',
        duration: '9 months',
        industry: 'Financial Services'
      },
      requirements: {
        technical: {
          experience: '12+ years digital transformation',
          expertise: ['Process Optimization', 'Change Management', 'Technology Strategy'],
          teamComposition: 'Senior consultants and subject matter experts'
        }
      },
      createdBy: tenant2Admin.id
    }
  });

  // Create tender assignments
  console.log('👤 Creating tender assignments...');
  await prisma.tenderAssignment.createMany({
    data: [
      { tenderId: tender1.id, userId: adminUser.id, role: TenderRole.owner },
      { tenderId: tender1.id, userId: memberUser1.id, role: TenderRole.contributor },
      { tenderId: tender1.id, userId: viewerUser.id, role: TenderRole.viewer },
      
      { tenderId: tender2.id, userId: memberUser1.id, role: TenderRole.owner },
      { tenderId: tender2.id, userId: memberUser2.id, role: TenderRole.contributor },
      
      { tenderId: tender3.id, userId: memberUser2.id, role: TenderRole.owner },
      { tenderId: tender3.id, userId: adminUser.id, role: TenderRole.contributor },
      
      { tenderId: tender4.id, userId: adminUser.id, role: TenderRole.owner },
      
      { tenderId: tender5.id, userId: tenant2Admin.id, role: TenderRole.owner }
    ]
  });

  // Create documents
  console.log('📄 Creating documents...');
  await prisma.document.createMany({
    data: [
      {
        tenderId: tender1.id,
        uploadedBy: adminUser.id,
        filename: 'rfp_cloud_migration.pdf',
        originalName: 'Cloud Migration RFP.pdf',
        mimeType: 'application/pdf',
        size: 2457600, // 2.4MB
        s3Key: 'documents/tender1/rfp_cloud_migration.pdf',
        s3Bucket: 'tenderflow',
        type: DocumentType.RFP,
        metadata: { pages: 45, version: '1.0' }
      },
      {
        tenderId: tender1.id,
        uploadedBy: memberUser1.id,
        filename: 'technical_proposal.docx',
        originalName: 'Technical Proposal - Cloud Migration.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 1234567,
        s3Key: 'documents/tender1/technical_proposal.docx',
        s3Bucket: 'tenderflow',
        type: DocumentType.TECHNICAL_SPEC,
        metadata: { wordCount: 8500, author: 'John Smith' }
      },
      {
        tenderId: tender2.id,
        uploadedBy: memberUser1.id,
        filename: 'crm_requirements.pdf',
        originalName: 'CRM System Requirements.pdf',
        mimeType: 'application/pdf',
        size: 1876543,
        s3Key: 'documents/tender2/crm_requirements.pdf',
        s3Bucket: 'tenderflow',
        type: DocumentType.RFP,
        metadata: { pages: 32, version: '2.1' }
      },
      {
        tenderId: tender4.id,
        uploadedBy: memberUser2.id,
        filename: 'submission_receipt.pdf',
        originalName: 'Municipal Portal Submission Receipt.pdf',
        mimeType: 'application/pdf',
        size: 234567,
        s3Key: 'documents/tender4/submission_receipt.pdf',
        s3Bucket: 'tenderflow',
        type: DocumentType.RECEIPT,
        metadata: { submissionId: 'MUN-SUB-2024-004-001' }
      }
    ]
  });

  // Create bids
  console.log('💰 Creating bids...');
  const bid1 = await prisma.bid.create({
    data: {
      tenderId: tender1.id,
      ownerId: adminUser.id,
      totalAmount: 118000.00,
      currency: 'USD',
      tasks: {
        phases: [
          {
            name: 'Assessment & Planning',
            duration: '2 weeks',
            deliverables: ['Current State Analysis', 'Migration Strategy', 'Risk Assessment'],
            effort: '160 hours'
          },
          {
            name: 'Infrastructure Setup',
            duration: '6 weeks',
            deliverables: ['AWS Account Setup', 'VPC Configuration', 'Security Implementation'],
            effort: '480 hours'
          },
          {
            name: 'Application Migration',
            duration: '12 weeks',
            deliverables: ['Database Migration', 'Application Refactoring', 'Testing'],
            effort: '960 hours'
          },
          {
            name: 'Go-Live & Support',
            duration: '4 weeks',
            deliverables: ['Deployment', 'Monitoring Setup', 'Documentation', 'Training'],
            effort: '320 hours'
          }
        ]
      },
      timeline: {
        startDate: '2024-09-01',
        milestones: [
          { name: 'Assessment Complete', date: '2024-09-15' },
          { name: 'Infrastructure Ready', date: '2024-10-27' },
          { name: 'Migration Complete', date: '2024-12-22' },
          { name: 'Go-Live', date: '2024-01-19' }
        ]
      },
      methodology: {
        approach: 'Agile with DevOps',
        frameworks: ['AWS Well-Architected Framework', 'ITIL'],
        tools: ['Terraform', 'Ansible', 'Jenkins', 'CloudWatch'],
        testingStrategy: 'Automated testing with manual validation'
      },
      team: {
        lead: 'Senior Cloud Architect (10+ years)',
        members: [
          'AWS Solutions Architect',
          'DevOps Engineer',
          'Database Specialist',
          'Security Engineer',
          'QA Engineer'
        ],
        partTime: ['Project Manager (50%)', 'Technical Writer (25%)']
      },
      assumptions: {
        technical: [
          'Current applications are containerizable',
          'Database can be migrated with minimal downtime',
          'Network connectivity is stable'
        ],
        business: [
          'Stakeholders available for decision making',
          'Testing environment can be provided',
          'Go-live window flexibility of +/- 1 week'
        ]
      },
      riskAssessment: {
        high: [
          {
            risk: 'Data loss during migration',
            mitigation: 'Multiple backup strategies and rollback procedures',
            probability: 'Low',
            impact: 'High'
          }
        ],
        medium: [
          {
            risk: 'Performance degradation',
            mitigation: 'Comprehensive load testing and optimization',
            probability: 'Medium',
            impact: 'Medium'
          }
        ]
      },
      qualityPlan: {
        standards: ['AWS Best Practices', 'Security Compliance', 'Performance Benchmarks'],
        testing: ['Unit Testing', 'Integration Testing', 'Performance Testing', 'Security Testing'],
        reviews: ['Code Reviews', 'Architecture Reviews', 'Security Reviews']
      },
      deliverables: {
        documentation: [
          'Architecture Diagrams',
          'Deployment Guides',
          'Operations Manual',
          'Training Materials'
        ],
        code: [
          'Infrastructure as Code (Terraform)',
          'Deployment Scripts',
          'Monitoring Configurations'
        ],
        reports: [
          'Migration Report',
          'Performance Analysis',
          'Security Assessment'
        ]
      },
      notes: 'Our team has successfully completed 15+ similar cloud migrations in the past 3 years.',
      isSubmitted: false
    }
  });

  const bid2 = await prisma.bid.create({
    data: {
      tenderId: tender2.id,
      ownerId: memberUser1.id,
      totalAmount: 235000.00,
      currency: 'USD',
      tasks: {
        phases: [
          {
            name: 'Requirements Analysis',
            duration: '4 weeks',
            deliverables: ['Business Requirements', 'Technical Specifications', 'UI/UX Mockups']
          },
          {
            name: 'Development',
            duration: '32 weeks',
            deliverables: ['Core Platform', 'Integrations', 'Analytics Dashboard', 'Mobile App']
          },
          {
            name: 'Testing & Deployment',
            duration: '6 weeks',
            deliverables: ['Quality Assurance', 'Performance Testing', 'Production Deployment']
          }
        ]
      },
      isSubmitted: true,
      submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
    }
  });

  // Create submissions
  console.log('📤 Creating submissions...');
  await prisma.submission.createMany({
    data: [
      {
        tenderId: tender4.id,
        method: SubmissionMethod.PORTAL,
        submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        submittedBy: memberUser2.id,
        externalRef: 'MUN-SUB-2024-004-001',
        receiptKey: 'receipts/tender4/submission_receipt.pdf',
        parsed: {
          submissionId: 'MUN-SUB-2024-004-001',
          confirmationNumber: 'CONF-789123',
          timestamp: '2024-08-29T14:30:00Z',
          status: 'RECEIVED'
        },
        parsedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000), // 5 minutes after submission
        parseVersion: '1.0.0',
        amount: 485000.00,
        currency: 'USD',
        status: 'RECEIVED',
        portalData: {
          portalName: 'Municipal Procurement Portal',
          category: 'Construction Management',
          contactEmail: 'procurement@chicago.gov'
        },
        notes: 'Submitted via municipal portal with all required documentation'
      }
    ]
  });

  // Create tender validations
  console.log('✅ Creating tender validations...');
  await prisma.tenderValidation.createMany({
    data: [
      {
        tenderId: tender1.id,
        criteria: {
          technical: {
            score: 95,
            requirements: ['Cloud expertise', 'AWS certifications', 'Security clearance'],
            met: [true, true, true]
          },
          financial: {
            score: 85,
            budgetFit: true,
            estimatedValue: 125000,
            bidAmount: 118000
          },
          experience: {
            score: 90,
            similarProjects: 15,
            clientReferences: 8,
            yearsInBusiness: 12
          }
        },
        score: 90.00,
        isValid: true,
        validatedBy: adminUser.id,
        validatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        notes: 'Excellent technical fit. Team has strong AWS experience and relevant certifications.'
      },
      {
        tenderId: tender5.id,
        criteria: {
          technical: {
            score: 88,
            requirements: ['Digital transformation experience', 'Financial services knowledge'],
            met: [true, true]
          },
          strategic: {
            score: 92,
            methodology: 'Proven framework',
            changeManagement: true,
            riskAssessment: 'Comprehensive'
          }
        },
        score: 90.00,
        isValid: true,
        validatedBy: tenant2Admin.id,
        validatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        notes: 'Strong strategic approach with excellent financial services domain knowledge.'
      }
    ]
  });

  // Create state transitions
  console.log('🔄 Creating state transitions...');
  await prisma.stateTransition.createMany({
    data: [
      {
        tenderId: tender1.id,
        fromStatus: TenderStatus.SCRAPED,
        toStatus: TenderStatus.VALIDATED,
        triggeredBy: adminUser.id,
        reason: 'Initial validation completed - meets all technical requirements',
        metadata: { validationScore: 85, autoValidated: false },
        createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
      },
      {
        tenderId: tender1.id,
        fromStatus: TenderStatus.VALIDATED,
        toStatus: TenderStatus.QUALIFIED,
        triggeredBy: adminUser.id,
        reason: 'Tender qualified after team review - proceeding with bid preparation',
        metadata: { teamDecision: true, budgetApproved: true },
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      },
      {
        tenderId: tender2.id,
        fromStatus: TenderStatus.SCRAPED,
        toStatus: TenderStatus.VALIDATED,
        triggeredBy: memberUser1.id,
        reason: 'Automated validation passed',
        metadata: { validationScore: 92, autoValidated: true },
        createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
      },
      {
        tenderId: tender2.id,
        fromStatus: TenderStatus.VALIDATED,
        toStatus: TenderStatus.QUALIFIED,
        triggeredBy: memberUser1.id,
        reason: 'Strong technical match - team has extensive CRM development experience',
        metadata: { teamDecision: true },
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      },
      {
        tenderId: tender2.id,
        fromStatus: TenderStatus.QUALIFIED,
        toStatus: TenderStatus.IN_BID,
        triggeredBy: memberUser1.id,
        reason: 'Bid preparation started',
        metadata: { bidOwner: memberUser1.id },
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      },
      {
        tenderId: tender4.id,
        fromStatus: TenderStatus.SCRAPED,
        toStatus: TenderStatus.VALIDATED,
        triggeredBy: memberUser2.id,
        reason: 'Construction management expertise validated',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
      },
      {
        tenderId: tender4.id,
        fromStatus: TenderStatus.VALIDATED,
        toStatus: TenderStatus.QUALIFIED,
        triggeredBy: adminUser.id,
        reason: 'High-value opportunity - approved for bid submission',
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
      },
      {
        tenderId: tender4.id,
        fromStatus: TenderStatus.QUALIFIED,
        toStatus: TenderStatus.IN_BID,
        triggeredBy: memberUser2.id,
        reason: 'Bid development in progress',
        createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
      },
      {
        tenderId: tender4.id,
        fromStatus: TenderStatus.IN_BID,
        toStatus: TenderStatus.SUBMITTED,
        triggeredBy: memberUser2.id,
        reason: 'Bid submitted successfully via municipal portal',
        metadata: { submissionId: 'MUN-SUB-2024-004-001', method: 'PORTAL' },
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      }
    ]
  });

  // Create comments
  console.log('💬 Creating comments...');
  await prisma.comment.createMany({
    data: [
      {
        tenderId: tender1.id,
        authorId: adminUser.id,
        content: 'This cloud migration project aligns perfectly with our AWS expertise. The timeline is reasonable and the client seems well-prepared.',
        createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
      },
      {
        tenderId: tender1.id,
        authorId: memberUser1.id,
        content: 'I have experience with similar government cloud migrations. The security clearance requirement is noted - I have active clearance.',
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000)
      },
      {
        tenderId: tender1.id,
        authorId: adminUser.id,
        content: '@john.smith that\'s excellent. Can you take the lead on the technical proposal? Your clearance and AWS experience make you the perfect fit.',
        metadata: { mentions: ['john.smith'] },
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000)
      },
      {
        tenderId: tender2.id,
        authorId: memberUser1.id,
        content: 'The CRM requirements are comprehensive. We should highlight our recent Salesforce integration work and React expertise.',
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      },
      {
        tenderId: tender2.id,
        authorId: memberUser2.id,
        content: 'I can contribute to the UI/UX design section. Our portfolio has several similar enterprise dashboards.',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000)
      },
      {
        tenderId: tender4.id,
        authorId: memberUser2.id,
        content: 'Submission completed! Receipt uploaded and parsed successfully. Municipal portal shows status as RECEIVED.',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 10 * 60 * 1000)
      },
      {
        tenderId: tender4.id,
        authorId: adminUser.id,
        content: 'Great work on the submission! This is a significant opportunity for our construction management practice.',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000)
      }
    ]
  });

  // Create notifications
  console.log('🔔 Creating notifications...');
  await prisma.notification.createMany({
    data: [
      {
        userId: adminUser.id,
        tenderId: tender1.id,
        type: NotificationType.TENDER_ASSIGNED,
        title: 'New Tender Assignment',
        message: 'You have been assigned as owner of "Cloud Infrastructure Migration Project"',
        data: { role: 'owner', assignedBy: adminUser.id },
        isRead: true,
        readAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
        createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
      },
      {
        userId: memberUser1.id,
        tenderId: tender1.id,
        type: NotificationType.TENDER_ASSIGNED,
        title: 'Tender Assignment',
        message: 'You have been assigned as contributor to "Cloud Infrastructure Migration Project"',
        data: { role: 'contributor', assignedBy: adminUser.id },
        isRead: true,
        readAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000),
        createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
      },
      {
        userId: adminUser.id,
        tenderId: tender1.id,
        type: NotificationType.TENDER_STATUS_CHANGED,
        title: 'Tender Status Update',
        message: 'Tender "Cloud Infrastructure Migration Project" moved to QUALIFIED',
        data: { oldStatus: 'VALIDATED', newStatus: 'QUALIFIED' },
        isRead: true,
        readAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000),
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      },
      {
        userId: memberUser1.id,
        tenderId: tender2.id,
        type: NotificationType.TENDER_STATUS_CHANGED,
        title: 'Tender Status Update',
        message: 'Tender "Enterprise Software Development" moved to IN_BID',
        data: { oldStatus: 'QUALIFIED', newStatus: 'IN_BID' },
        isRead: false,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      },
      {
        userId: adminUser.id,
        tenderId: tender2.id,
        type: NotificationType.SUBMISSION_DUE,
        title: 'Submission Deadline Approaching',
        message: 'Tender "Enterprise Software Development" deadline is in 21 days',
        data: { daysRemaining: 21, deadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000) },
        isRead: false,
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      },
      {
        userId: memberUser2.id,
        tenderId: tender4.id,
        type: NotificationType.DOCUMENT_UPLOADED,
        title: 'Document Uploaded',
        message: 'Submission receipt uploaded for "Office Building Construction Management"',
        data: { documentType: 'RECEIPT', filename: 'submission_receipt.pdf' },
        isRead: true,
        readAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000),
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      }
    ]
  });

  // Create audit logs
  console.log('📊 Creating audit logs...');
  await prisma.auditLog.createMany({
    data: [
      {
        tenantId: tenant1.id,
        userId: adminUser.id,
        action: AuditAction.CREATE,
        resource: 'tender',
        resourceId: tender1.id,
        newValues: { title: 'Cloud Infrastructure Migration Project', status: 'SCRAPED' },
        metadata: { source: 'manual_entry' },
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      },
      {
        tenantId: tenant1.id,
        userId: adminUser.id,
        action: AuditAction.TRANSITION,
        resource: 'tender',
        resourceId: tender1.id,
        oldValues: { status: 'SCRAPED' },
        newValues: { status: 'VALIDATED' },
        metadata: { reason: 'Initial validation completed', validationScore: 85 },
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
      },
      {
        tenantId: tenant1.id,
        userId: memberUser1.id,
        action: AuditAction.UPLOAD,
        resource: 'document',
        resourceId: 'doc-001', // Would be actual document ID
        newValues: { filename: 'technical_proposal.docx', type: 'TECHNICAL_SPEC' },
        metadata: { size: 1234567, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        ipAddress: '192.168.1.101',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
      },
      {
        tenantId: tenant1.id,
        userId: memberUser2.id,
        action: AuditAction.TRANSITION,
        resource: 'tender',
        resourceId: tender4.id,
        oldValues: { status: 'IN_BID' },
        newValues: { status: 'SUBMITTED' },
        metadata: { submissionMethod: 'PORTAL', externalRef: 'MUN-SUB-2024-004-001' },
        ipAddress: '192.168.1.102',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      }
    ]
  });

  // Create system configuration
  console.log('⚙️  Creating system configuration...');
  await prisma.systemConfig.createMany({
    data: [
      {
        key: 'email_notifications_enabled',
        value: true,
        description: 'Global flag to enable/disable email notifications',
        isActive: true
      },
      {
        key: 'max_file_upload_size',
        value: 50000000, // 50MB
        description: 'Maximum file upload size in bytes',
        isActive: true
      },
      {
        key: 'tender_auto_validation_threshold',
        value: 80,
        description: 'Score threshold for automatic tender validation',
        isActive: true
      },
      {
        key: 'default_currency',
        value: 'USD',
        description: 'Default currency for new tenders',
        isActive: true
      },
      {
        key: 'deadline_reminder_days',
        value: [30, 14, 7, 3, 1],
        description: 'Days before deadline to send reminders',
        isActive: true
      }
    ]
  });

  // Create API keys
  console.log('🔑 Creating API keys...');
  await prisma.apiKey.createMany({
    data: [
      {
        tenantId: tenant1.id,
        name: 'TechCorp Production API',
        key: 'tc_prod_ak_' + Math.random().toString(36).substring(2, 15),
        permissions: ['read', 'write', 'upload'],
        isActive: true,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
      },
      {
        tenantId: tenant1.id,
        name: 'TechCorp Development API',
        key: 'tc_dev_ak_' + Math.random().toString(36).substring(2, 15),
        permissions: ['read', 'write'],
        isActive: true,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
      },
      {
        name: 'System Integration Key',
        key: 'sys_int_ak_' + Math.random().toString(36).substring(2, 15),
        permissions: ['read', 'system'],
        isActive: true,
        expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000) // 180 days
      }
    ]
  });

  // Create job queue entries
  console.log('🔄 Creating job queue entries...');
  await prisma.jobQueue.createMany({
    data: [
      {
        name: 'parse-receipt',
        data: {
          documentId: 'receipt-doc-id',
          s3Key: 'receipts/tender4/submission_receipt.pdf',
          tenderId: tender4.id,
          parseVersion: '1.0.0'
        },
        priority: 10,
        status: 'completed',
        processedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000)
      },
      {
        name: 'send-notification',
        data: {
          userId: adminUser.id,
          type: 'DEADLINE_REMINDER',
          tenderId: tender2.id,
          template: 'deadline_reminder_email'
        },
        priority: 5,
        status: 'waiting',
        attempts: 0
      },
      {
        name: 'generate-report',
        data: {
          tenantId: tenant1.id,
          reportType: 'tender_summary',
          dateRange: { from: '2024-08-01', to: '2024-08-31' },
          requestedBy: adminUser.id
        },
        priority: 1,
        status: 'processing',
        attempts: 1,
        processedAt: new Date()
      }
    ]
  });

  console.log('✅ Database seeding completed successfully!');
  console.log('\n📊 Seeded data summary:');
  console.log(`   • ${await prisma.tenant.count()} tenants`);
  console.log(`   • ${await prisma.user.count()} users`);
  console.log(`   • ${await prisma.tender.count()} tenders`);
  console.log(`   • ${await prisma.tenderAssignment.count()} tender assignments`);
  console.log(`   • ${await prisma.document.count()} documents`);
  console.log(`   • ${await prisma.bid.count()} bids`);
  console.log(`   • ${await prisma.submission.count()} submissions`);
  console.log(`   • ${await prisma.tenderValidation.count()} tender validations`);
  console.log(`   • ${await prisma.stateTransition.count()} state transitions`);
  console.log(`   • ${await prisma.comment.count()} comments`);
  console.log(`   • ${await prisma.notification.count()} notifications`);
  console.log(`   • ${await prisma.auditLog.count()} audit log entries`);
  console.log(`   • ${await prisma.systemConfig.count()} system configurations`);
  console.log(`   • ${await prisma.apiKey.count()} API keys`);
  console.log(`   • ${await prisma.jobQueue.count()} job queue entries`);
  
  console.log('\n🎯 Test accounts created:');
  console.log('   • admin@techcorp.com (Admin - Sarah Johnson)');
  console.log('   • john.smith@techcorp.com (Member - John Smith)');
  console.log('   • emma.wilson@techcorp.com (Member - Emma Wilson)');
  console.log('   • viewer@techcorp.com (Viewer - Mike Brown)');
  console.log('   • admin@globalconsulting.com (Admin - Lisa Davis)');
}

main()
  .catch((e) => {
    console.error('❌ Error during database seeding:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });