// API route handlers for MSW mocking
import { http, HttpResponse } from 'msw';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export const handlers = [
  // Authentication endpoints
  http.post(`${API_BASE_URL}/auth/login`, async ({ request }) => {
    const body = await request.json() as any;
    
    if (body.email === 'test@example.com' && body.password === 'password123') {
      return HttpResponse.json({
        success: true,
        data: {
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
            role: 'admin',
          },
          tenant: {
            id: 'test-tenant-id',
            name: 'Test Company',
            subdomain: 'test-company',
          },
        },
      });
    }

    return HttpResponse.json(
      {
        success: false,
        error: 'Authentication failed',
      },
      { status: 401 }
    );
  }),

  http.post(`${API_BASE_URL}/auth/register`, async ({ request }) => {
    const body = await request.json() as any;
    
    return HttpResponse.json({
      success: true,
      data: {
        user: {
          id: 'new-user-id',
          email: body.email,
          firstName: body.firstName,
          lastName: body.lastName,
          role: 'admin',
        },
        tenant: {
          id: 'new-tenant-id',
          name: body.tenantName,
          subdomain: body.tenantSubdomain,
        },
      },
    }, { status: 201 });
  }),

  http.get(`${API_BASE_URL}/auth/me`, ({ request }) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return HttpResponse.json({
      success: true,
      data: {
        id: 'test-user-id',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'admin',
        tenant: {
          id: 'test-tenant-id',
          name: 'Test Company',
          subdomain: 'test-company',
        },
      },
    });
  }),

  // Tender endpoints
  http.get(`${API_BASE_URL}/tenders`, ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const status = url.searchParams.get('status');
    const category = url.searchParams.get('category');
    const search = url.searchParams.get('search');

    let mockTenders = [
      {
        id: 'tender-1',
        title: 'IT Services Tender',
        description: 'Comprehensive IT services for government department',
        category: 'IT_SERVICES',
        status: 'SCRAPED',
        deadline: '2024-12-31T23:59:59.000Z',
        estimatedValue: 100000,
        currency: 'USD',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
      {
        id: 'tender-2',
        title: 'Construction Project Tender',
        description: 'Office building construction and renovation',
        category: 'CONSTRUCTION',
        status: 'VALIDATED',
        deadline: '2025-03-15T15:30:00.000Z',
        estimatedValue: 500000,
        currency: 'EUR',
        createdAt: '2024-01-16T14:30:00.000Z',
        updatedAt: '2024-01-16T14:30:00.000Z',
      },
      {
        id: 'tender-3',
        title: 'Legal Services Consultation',
        description: 'Legal advisory services for regulatory compliance',
        category: 'LEGAL_SERVICES',
        status: 'ASSIGNED',
        deadline: '2025-02-28T12:00:00.000Z',
        estimatedValue: 75000,
        currency: 'GBP',
        assigneeId: 'test-user-id',
        createdAt: '2024-01-17T09:15:00.000Z',
        updatedAt: '2024-01-17T09:15:00.000Z',
      },
    ];

    // Apply filters
    if (status) {
      mockTenders = mockTenders.filter(t => t.status === status);
    }
    if (category) {
      mockTenders = mockTenders.filter(t => t.category === category);
    }
    if (search) {
      mockTenders = mockTenders.filter(t => 
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const paginatedTenders = mockTenders.slice(start, start + limit);

    return HttpResponse.json({
      success: true,
      data: paginatedTenders,
      pagination: {
        page,
        limit,
        totalItems: mockTenders.length,
        totalPages: Math.ceil(mockTenders.length / limit),
      },
    });
  }),

  http.get(`${API_BASE_URL}/tenders/:id`, ({ params }) => {
    const { id } = params;
    
    const mockTender = {
      id: id as string,
      title: 'IT Services Tender',
      description: 'Comprehensive IT services for government department',
      category: 'IT_SERVICES',
      status: 'SCRAPED',
      deadline: '2024-12-31T23:59:59.000Z',
      estimatedValue: 100000,
      currency: 'USD',
      sourceUrl: 'https://example.com/tender/123',
      sourceReference: 'TND-2024-001',
      metadata: {
        extractorType: 'manual',
        confidence: 1.0,
        language: 'en',
      },
      documents: [
        {
          id: 'doc-1',
          filename: 'tender-specification.pdf',
          mimeType: 'application/pdf',
          size: 1024000,
          uploadedAt: '2024-01-15T10:00:00.000Z',
        },
      ],
      submissions: [],
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };

    return HttpResponse.json({
      success: true,
      data: mockTender,
    });
  }),

  http.post(`${API_BASE_URL}/tenders`, async ({ request }) => {
    const body = await request.json() as any;
    
    const newTender = {
      id: 'new-tender-id',
      ...body,
      status: 'SCRAPED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return HttpResponse.json({
      success: true,
      data: newTender,
    }, { status: 201 });
  }),

  http.put(`${API_BASE_URL}/tenders/:id`, async ({ params, request }) => {
    const { id } = params;
    const body = await request.json() as any;
    
    const updatedTender = {
      id: id as string,
      title: 'IT Services Tender',
      description: 'Comprehensive IT services for government department',
      category: 'IT_SERVICES',
      status: 'SCRAPED',
      deadline: '2024-12-31T23:59:59.000Z',
      estimatedValue: 100000,
      currency: 'USD',
      ...body,
      updatedAt: new Date().toISOString(),
    };

    return HttpResponse.json({
      success: true,
      data: updatedTender,
    });
  }),

  // Document endpoints
  http.post(`${API_BASE_URL}/documents/upload`, async ({ request }) => {
    return HttpResponse.json({
      success: true,
      data: {
        id: 'new-document-id',
        filename: 'uploaded-file.pdf',
        mimeType: 'application/pdf',
        size: 1024000,
        url: 'https://example.com/documents/uploaded-file.pdf',
        ocrStatus: 'PENDING',
        uploadedAt: new Date().toISOString(),
      },
    }, { status: 201 });
  }),

  http.get(`${API_BASE_URL}/documents`, () => {
    return HttpResponse.json({
      success: true,
      data: [
        {
          id: 'doc-1',
          filename: 'document-1.pdf',
          mimeType: 'application/pdf',
          size: 1024000,
          ocrStatus: 'COMPLETED',
          uploadedAt: '2024-01-15T10:00:00.000Z',
        },
        {
          id: 'doc-2',
          filename: 'document-2.jpg',
          mimeType: 'image/jpeg',
          size: 2048000,
          ocrStatus: 'PROCESSING',
          uploadedAt: '2024-01-16T14:30:00.000Z',
        },
      ],
      pagination: {
        page: 1,
        limit: 20,
        totalItems: 2,
        totalPages: 1,
      },
    });
  }),

  // Categories endpoint
  http.get(`${API_BASE_URL}/categories`, () => {
    return HttpResponse.json({
      success: true,
      data: [
        'IT_SERVICES',
        'CONSTRUCTION',
        'LEGAL_SERVICES',
        'CONSULTING',
        'MANUFACTURING',
        'HEALTHCARE',
        'EDUCATION',
        'TRANSPORTATION',
        'ENERGY',
        'OTHER',
      ],
    });
  }),

  // Health check
  http.get(`${API_BASE_URL}/health`, () => {
    return HttpResponse.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    });
  }),

  // Fallback for unhandled requests
  http.all('*', ({ request }) => {
    console.warn(`Unhandled ${request.method} request to ${request.url}`);
    return HttpResponse.json(
      { error: 'Endpoint not mocked' },
      { status: 404 }
    );
  }),
];