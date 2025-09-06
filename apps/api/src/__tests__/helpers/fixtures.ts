// Test fixtures for TenderFlow API tests
import { Tenant, User, Tender, Document, Submission } from '../../generated/prisma';

export const TEST_FIXTURES = {
  // Tenant fixtures
  tenant: {
    default: {
      name: 'Test Company',
      subdomain: 'test-company',
      settings: {
        allowGuestSubmissions: false,
        requireTwoFactorAuth: false,
        maxFileSize: 50000000,
      },
      isActive: true,
    },
    inactive: {
      name: 'Inactive Company',
      subdomain: 'inactive-company',
      settings: {},
      isActive: false,
    },
  } as Record<string, Partial<Tenant>>,

  // User fixtures
  user: {
    admin: {
      email: 'admin@test.com',
      passwordHash: '$2b$10$8K1p/a0dURXAm7QisSp5.eQKm2K5J2K5J2K5J2K5J2K5J2K5J2',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      isActive: true,
    },
    manager: {
      email: 'manager@test.com',
      passwordHash: '$2b$10$8K1p/a0dURXAm7QisSp5.eQKm2K5J2K5J2K5J2K5J2K5J2K5J2',
      firstName: 'Manager',
      lastName: 'User',
      role: 'manager',
      isActive: true,
    },
    viewer: {
      email: 'viewer@test.com',
      passwordHash: '$2b$10$8K1p/a0dURXAm7QisSp5.eQKm2K5J2K5J2K5J2K5J2K5J2K5J2',
      firstName: 'Viewer',
      lastName: 'User',
      role: 'viewer',
      isActive: true,
    },
    inactive: {
      email: 'inactive@test.com',
      passwordHash: '$2b$10$8K1p/a0dURXAm7QisSp5.eQKm2K5J2K5J2K5J2K5J2K5J2K5J2',
      firstName: 'Inactive',
      lastName: 'User',
      role: 'viewer',
      isActive: false,
    },
  } as Record<string, Partial<User>>,

  // Tender fixtures
  tender: {
    scraped: {
      title: 'Test IT Services Tender',
      description: 'A comprehensive IT services tender for testing purposes',
      category: 'IT_SERVICES',
      status: 'SCRAPED',
      deadline: new Date('2024-12-31T23:59:59.000Z'),
      estimatedValue: 100000,
      currency: 'USD',
      sourceUrl: 'https://example.com/tender/123',
      sourceReference: 'TND-2024-001',
      metadata: {
        extractorType: 'manual',
        confidence: 1.0,
        language: 'en',
      },
    },
    validated: {
      title: 'Validated Construction Tender',
      description: 'Construction services tender that has been validated',
      category: 'CONSTRUCTION',
      status: 'VALIDATED',
      deadline: new Date('2025-03-15T15:30:00.000Z'),
      estimatedValue: 500000,
      currency: 'EUR',
      sourceUrl: 'https://example.com/tender/456',
      sourceReference: 'TND-2024-002',
      metadata: {
        extractorType: 'eu-ted',
        confidence: 0.95,
        language: 'en',
      },
    },
    assigned: {
      title: 'Assigned Legal Services Tender',
      description: 'Legal services tender assigned to team member',
      category: 'LEGAL_SERVICES',
      status: 'ASSIGNED',
      deadline: new Date('2025-02-28T12:00:00.000Z'),
      estimatedValue: 75000,
      currency: 'GBP',
      sourceUrl: 'https://example.com/tender/789',
      sourceReference: 'TND-2024-003',
      metadata: {
        extractorType: 'generic-email',
        confidence: 0.85,
        language: 'en',
      },
    },
  } as Record<string, Partial<Tender>>,

  // Document fixtures
  document: {
    pdf: {
      filename: 'test-document.pdf',
      mimeType: 'application/pdf',
      size: 1024000,
      s3Key: 'documents/test-document.pdf',
      url: 'https://test-bucket.s3.amazonaws.com/documents/test-document.pdf',
      extractedText: 'This is extracted text from a PDF document',
      ocrStatus: 'COMPLETED',
      metadata: {
        pages: 5,
        extractorType: 'pdf-invoice',
        language: 'en',
      },
    },
    image: {
      filename: 'test-image.jpg',
      mimeType: 'image/jpeg',
      size: 2048000,
      s3Key: 'documents/test-image.jpg',
      url: 'https://test-bucket.s3.amazonaws.com/documents/test-image.jpg',
      extractedText: 'OCR text from image',
      ocrStatus: 'COMPLETED',
      metadata: {
        width: 1920,
        height: 1080,
        extractorType: 'ocr',
      },
    },
    failed: {
      filename: 'corrupted-file.pdf',
      mimeType: 'application/pdf',
      size: 500,
      s3Key: 'documents/corrupted-file.pdf',
      url: 'https://test-bucket.s3.amazonaws.com/documents/corrupted-file.pdf',
      extractedText: null,
      ocrStatus: 'FAILED',
      metadata: {
        error: 'File appears to be corrupted',
      },
    },
  } as Record<string, Partial<Document>>,

  // Submission fixtures
  submission: {
    draft: {
      bidAmount: 95000,
      currency: 'USD',
      status: 'DRAFT',
      submissionData: {
        companyName: 'Test Bidder Corp',
        contactEmail: 'contact@testbidder.com',
        proposal: 'Our comprehensive proposal for the IT services tender',
      },
      metadata: {
        source: 'web-form',
        userAgent: 'Mozilla/5.0 Test Browser',
      },
    },
    submitted: {
      bidAmount: 85000,
      currency: 'USD',
      status: 'SUBMITTED',
      submittedAt: new Date('2024-01-15T10:30:00.000Z'),
      submissionData: {
        companyName: 'Another Bidder Ltd',
        contactEmail: 'info@anotherbidder.com',
        proposal: 'Detailed technical proposal with cost breakdown',
      },
      metadata: {
        source: 'api',
        submissionTime: '2024-01-15T10:30:00.000Z',
      },
    },
  } as Record<string, Partial<Submission>>,

  // Authentication payloads
  auth: {
    login: {
      valid: {
        email: 'test@example.com',
        password: 'password123',
      },
      invalid: {
        email: 'test@example.com',
        password: 'wrongpassword',
      },
      malformed: {
        email: 'invalid-email',
        password: '',
      },
    },
    register: {
      valid: {
        email: 'newuser@example.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
        tenantName: 'New Company',
        tenantSubdomain: 'new-company',
      },
      duplicate: {
        email: 'test@example.com', // Already exists
        password: 'password123',
        firstName: 'Duplicate',
        lastName: 'User',
        tenantName: 'Duplicate Company',
        tenantSubdomain: 'duplicate-company',
      },
    },
  },

  // API request headers
  headers: {
    auth: (token: string) => ({
      authorization: `Bearer ${token}`,
    }),
    tenant: (tenantId: string) => ({
      'x-tenant-id': tenantId,
    }),
    authTenant: (token: string, tenantId: string) => ({
      authorization: `Bearer ${token}`,
      'x-tenant-id': tenantId,
    }),
    multipart: {
      'content-type': 'multipart/form-data',
    },
  },
};

// Helper function to create deep copies of fixtures
export function createFixture<T>(fixture: T): T {
  return JSON.parse(JSON.stringify(fixture));
}

// Helper function to merge fixture with custom data
export function mergeFixture<T>(fixture: T, overrides: Partial<T>): T {
  return { ...createFixture(fixture), ...overrides };
}