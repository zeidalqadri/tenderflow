// Document processing and receipt parsing integration tests for TenderFlow API

import { FastifyInstance } from 'fastify';
import { TestServer } from '../helpers/test-server';
import { TEST_FIXTURES, createFixture } from '../helpers/fixtures';
import supertest from 'supertest';
import nock from 'nock';

describe('Document Processing Integration Tests', () => {
  let testServer: TestServer;
  let server: FastifyInstance;
  let request: supertest.SuperTest<supertest.Test>;
  let testData: { tenant: any; user: any; token: string };

  beforeAll(async () => {
    testServer = new TestServer();
    server = await testServer.create({ mockExternalServices: true });
    await server.ready();
    request = supertest(server.server);
  });

  afterAll(async () => {
    await testServer.cleanup();
    nock.cleanAll();
  });

  beforeEach(async () => {
    await testServer.resetDatabase();
    testData = await testServer.seedTestData();
    nock.cleanAll();
  });

  describe('Receipt Parsing Workflow', () => {
    it('should parse receipt document and extract submission data', async () => {
      // Mock S3 upload
      nock('http://localhost:4566')
        .put('/test-bucket/documents/test-receipt.pdf')
        .reply(200, { ETag: '"test-etag"' });

      // Mock OCR service
      nock('http://localhost:8080')
        .post('/ocr/extract')
        .reply(200, {
          text: `
            РЕСПУБЛИКА КАЗАХСТАН
            Портал государственных закупок zakup.sk.kz
            
            Заявка № KZ-2024-001234
            Лот № 5
            Сумма: 1,500,000 тенге
            Организация: ТОО "Тест Компания"
            БИН: 123456789012
            
            Дата подачи: 15.01.2024
            Статус: принято
          `,
          confidence: 0.95,
        });

      // Upload receipt document
      const uploadResponse = await request
        .post('/api/v1/documents/upload')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .attach('file', Buffer.from('fake pdf content'), 'test-receipt.pdf')
        .field('type', 'receipt')
        .field('description', 'Test receipt upload');

      expect(uploadResponse.status).toBe(201);
      
      const document = uploadResponse.body.data;
      expect(document).toHaveProperty('id');
      expect(document.filename).toBe('test-receipt.pdf');
      expect(document.ocrStatus).toBe('PENDING');

      // Wait for OCR processing (simulate webhook)
      const ocrResponse = await request
        .post(`/api/v1/documents/${document.id}/ocr-complete`)
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          text: `
            РЕСПУБЛИКА КАЗАХСТАН
            Портал государственных закупок zakup.sk.kz
            
            Заявка № KZ-2024-001234
            Лот № 5
            Сумма: 1,500,000 тенге
            Организация: ТОО "Тест Компания"
            БИН: 123456789012
            
            Дата подачи: 15.01.2024
            Статус: принято
          `,
          confidence: 0.95,
        });

      expect(ocrResponse.status).toBe(200);

      // Check document status
      const checkResponse = await request
        .get(`/api/v1/documents/${document.id}`)
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id);

      expect(checkResponse.status).toBe(200);
      const updatedDocument = checkResponse.body.data;
      expect(updatedDocument.ocrStatus).toBe('COMPLETED');
      expect(updatedDocument.extractedText).toContain('KZ-2024-001234');

      // Check if submission was created
      const submissionsResponse = await request
        .get('/api/v1/submissions')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id);

      expect(submissionsResponse.status).toBe(200);
      const submissions = submissionsResponse.body.data;
      expect(submissions).toHaveLength(1);
      
      const submission = submissions[0];
      expect(submission.submissionData.submissionRef).toBe('KZ-2024-001234');
      expect(submission.bidAmount).toBe(1500000);
      expect(submission.currency).toBe('KZT');
    });

    it('should handle multiple receipt extractors', async () => {
      // Test EU TED extractor
      nock('http://localhost:4566')
        .put('/test-bucket/documents/ted-notice.pdf')
        .reply(200, { ETag: '"test-etag"' });

      const tedUploadResponse = await request
        .post('/api/v1/documents/upload')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .attach('file', Buffer.from('fake pdf content'), 'ted-notice.pdf')
        .field('type', 'receipt');

      expect(tedUploadResponse.status).toBe(201);

      // Simulate TED document OCR completion
      const tedDocument = tedUploadResponse.body.data;
      await request
        .post(`/api/v1/documents/${tedDocument.id}/ocr-complete`)
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          text: `
            SUPPLEMENT TO THE OFFICIAL JOURNAL OF THE EUROPEAN UNION
            Tenders Electronic Daily
            
            Notice number: 2024/S 123-456789
            Contract Notice
            
            Title: IT Services for Public Administration
            Contracting Authority: City of Brussels
            Estimated value: 500,000 EUR
            CPV: 72000000-5
            NUTS: BE100
            
            Deadline for receipt of tenders: 15/02/2024
            Type of procedure: Open procedure
          `,
          confidence: 0.92,
        });

      // Check if tender was created/updated
      const tendersResponse = await request
        .get('/api/v1/tenders?search=IT Services for Public Administration')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id);

      expect(tendersResponse.status).toBe(200);
      const tenders = tendersResponse.body.data;
      expect(tenders.length).toBeGreaterThan(0);
      
      const tender = tenders[0];
      expect(tender.title).toContain('IT Services');
      expect(tender.estimatedValue).toBe(500000);
      expect(tender.currency).toBe('EUR');
    });

    it('should handle receipt parsing failures gracefully', async () => {
      nock('http://localhost:4566')
        .put('/test-bucket/documents/corrupted-receipt.pdf')
        .reply(200, { ETag: '"test-etag"' });

      const uploadResponse = await request
        .post('/api/v1/documents/upload')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .attach('file', Buffer.from('corrupted content'), 'corrupted-receipt.pdf')
        .field('type', 'receipt');

      expect(uploadResponse.status).toBe(201);

      const document = uploadResponse.body.data;

      // Simulate OCR failure
      const ocrResponse = await request
        .post(`/api/v1/documents/${document.id}/ocr-complete`)
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          error: 'OCR processing failed: corrupted document',
          confidence: 0.0,
        });

      expect(ocrResponse.status).toBe(200);

      // Check document status
      const checkResponse = await request
        .get(`/api/v1/documents/${document.id}`)
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id);

      expect(checkResponse.status).toBe(200);
      const updatedDocument = checkResponse.body.data;
      expect(updatedDocument.ocrStatus).toBe('FAILED');
      expect(updatedDocument.metadata.error).toContain('OCR processing failed');
    });
  });

  describe('Document Confirmation Webhook', () => {
    let documentId: string;

    beforeEach(async () => {
      nock('http://localhost:4566')
        .put(/\/test-bucket\/documents\/.*/)
        .reply(200, { ETag: '"test-etag"' });

      const uploadResponse = await request
        .post('/api/v1/documents/upload')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .attach('file', Buffer.from('test content'), 'test-doc.pdf')
        .field('type', 'tender-document');

      documentId = uploadResponse.body.data.id;
    });

    it('should handle document confirmation webhook', async () => {
      const webhookResponse = await request
        .post('/api/v1/webhooks/document-confirmed')
        .set('x-webhook-signature', 'valid-signature')
        .send({
          documentId,
          status: 'confirmed',
          confirmedBy: 'external-service',
          metadata: {
            processingTime: 1500,
            confidence: 0.98,
          },
        });

      expect(webhookResponse.status).toBe(200);
      expect(webhookResponse.body.success).toBe(true);

      // Verify document was updated
      const documentResponse = await request
        .get(`/api/v1/documents/${documentId}`)
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id);

      expect(documentResponse.status).toBe(200);
      const document = documentResponse.body.data;
      expect(document.status).toBe('CONFIRMED');
      expect(document.metadata.confirmedBy).toBe('external-service');
    });

    it('should validate webhook signature', async () => {
      const webhookResponse = await request
        .post('/api/v1/webhooks/document-confirmed')
        .set('x-webhook-signature', 'invalid-signature')
        .send({
          documentId,
          status: 'confirmed',
        });

      expect(webhookResponse.status).toBe(401);
      expect(webhookResponse.body.error).toContain('Invalid webhook signature');
    });

    it('should handle webhook idempotency', async () => {
      const payload = {
        documentId,
        status: 'confirmed',
        confirmedBy: 'external-service',
        idempotencyKey: 'unique-key-123',
      };

      // Send webhook twice with same idempotency key
      const response1 = await request
        .post('/api/v1/webhooks/document-confirmed')
        .set('x-webhook-signature', 'valid-signature')
        .set('x-idempotency-key', payload.idempotencyKey)
        .send(payload);

      const response2 = await request
        .post('/api/v1/webhooks/document-confirmed')
        .set('x-webhook-signature', 'valid-signature')
        .set('x-idempotency-key', payload.idempotencyKey)
        .send(payload);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Both should return same response
      expect(response1.body).toEqual(response2.body);
    });
  });

  describe('Document Processing Pipeline', () => {
    it('should process document through complete pipeline', async () => {
      // Mock external services
      nock('http://localhost:4566')
        .put('/test-bucket/documents/pipeline-test.pdf')
        .reply(200, { ETag: '"test-etag"' });

      nock('http://localhost:8080')
        .post('/ocr/extract')
        .reply(200, {
          text: 'Extracted document text with tender information',
          confidence: 0.89,
        });

      nock('http://localhost:9090')
        .post('/ml/classify')
        .reply(200, {
          category: 'IT_SERVICES',
          confidence: 0.92,
          extractedData: {
            title: 'Software Development Services',
            deadline: '2024-06-30T15:00:00Z',
            estimatedValue: 75000,
            currency: 'USD',
          },
        });

      // 1. Upload document
      const uploadResponse = await request
        .post('/api/v1/documents/upload')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .attach('file', Buffer.from('test pdf content'), 'pipeline-test.pdf')
        .field('type', 'tender-document');

      expect(uploadResponse.status).toBe(201);
      const document = uploadResponse.body.data;

      // 2. Complete OCR processing
      await request
        .post(`/api/v1/documents/${document.id}/ocr-complete`)
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          text: 'Extracted document text with tender information',
          confidence: 0.89,
        });

      // 3. Complete ML classification
      await request
        .post(`/api/v1/documents/${document.id}/classify-complete`)
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          category: 'IT_SERVICES',
          confidence: 0.92,
          extractedData: {
            title: 'Software Development Services',
            deadline: '2024-06-30T15:00:00Z',
            estimatedValue: 75000,
            currency: 'USD',
          },
        });

      // 4. Verify document status
      const finalDocumentResponse = await request
        .get(`/api/v1/documents/${document.id}`)
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id);

      expect(finalDocumentResponse.status).toBe(200);
      const finalDocument = finalDocumentResponse.body.data;
      expect(finalDocument.ocrStatus).toBe('COMPLETED');
      expect(finalDocument.classificationStatus).toBe('COMPLETED');

      // 5. Check if tender was created
      const tendersResponse = await request
        .get('/api/v1/tenders?search=Software Development Services')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id);

      expect(tendersResponse.status).toBe(200);
      const tenders = tendersResponse.body.data;
      expect(tenders.length).toBeGreaterThan(0);
      
      const tender = tenders[0];
      expect(tender.title).toBe('Software Development Services');
      expect(tender.category).toBe('IT_SERVICES');
      expect(tender.estimatedValue).toBe(75000);
      expect(tender.documents).toHaveLength(1);
      expect(tender.documents[0].id).toBe(document.id);
    });

    it('should handle document processing retries', async () => {
      nock('http://localhost:4566')
        .put('/test-bucket/documents/retry-test.pdf')
        .reply(200, { ETag: '"test-etag"' });

      // Mock OCR failure then success
      nock('http://localhost:8080')
        .post('/ocr/extract')
        .reply(500, { error: 'Temporary service error' })
        .post('/ocr/extract')
        .reply(200, {
          text: 'Successfully extracted text on retry',
          confidence: 0.88,
        });

      const uploadResponse = await request
        .post('/api/v1/documents/upload')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .attach('file', Buffer.from('test content'), 'retry-test.pdf')
        .field('type', 'tender-document');

      expect(uploadResponse.status).toBe(201);
      const document = uploadResponse.body.data;

      // Simulate retry mechanism (normally handled by job queue)
      const retryResponse = await request
        .post(`/api/v1/documents/${document.id}/retry-processing`)
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id);

      expect(retryResponse.status).toBe(200);
      expect(retryResponse.body.data.retryCount).toBe(1);
    });
  });

  describe('Document Security and Validation', () => {
    it('should validate file types and sizes', async () => {
      // Test invalid file type
      const invalidTypeResponse = await request
        .post('/api/v1/documents/upload')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .attach('file', Buffer.from('malicious content'), 'malware.exe')
        .field('type', 'tender-document');

      expect(invalidTypeResponse.status).toBe(400);
      expect(invalidTypeResponse.body.error).toContain('file type');

      // Test file too large
      const largeFileContent = Buffer.alloc(60 * 1024 * 1024, 'x'); // 60MB
      const largeSizeResponse = await request
        .post('/api/v1/documents/upload')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .attach('file', largeFileContent, 'large-file.pdf')
        .field('type', 'tender-document');

      expect(largeSizeResponse.status).toBe(400);
      expect(largeSizeResponse.body.error).toContain('file size');
    });

    it('should scan documents for viruses', async () => {
      // Mock virus scanning service
      nock('http://localhost:7070')
        .post('/scan')
        .reply(200, { clean: false, threats: ['Test.Virus.Detected'] });

      nock('http://localhost:4566')
        .put('/test-bucket/documents/virus-test.pdf')
        .reply(200, { ETag: '"test-etag"' });

      const uploadResponse = await request
        .post('/api/v1/documents/upload')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .attach('file', Buffer.from('infected content'), 'virus-test.pdf')
        .field('type', 'tender-document');

      expect(uploadResponse.status).toBe(400);
      expect(uploadResponse.body.error).toContain('virus');
    });

    it('should enforce document access permissions', async () => {
      // Create document as one user
      nock('http://localhost:4566')
        .put('/test-bucket/documents/private-doc.pdf')
        .reply(200, { ETag: '"test-etag"' });

      const uploadResponse = await request
        .post('/api/v1/documents/upload')
        .set('authorization', `Bearer ${testData.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .attach('file', Buffer.from('private content'), 'private-doc.pdf')
        .field('type', 'tender-document');

      expect(uploadResponse.status).toBe(201);
      const document = uploadResponse.body.data;

      // Try to access as different tenant
      const prisma = testServer.getPrisma();
      const otherTenant = await prisma.tenant.create({
        data: createFixture({
          ...TEST_FIXTURES.tenant.default,
          subdomain: 'other-tenant',
          name: 'Other Tenant',
        }),
      });

      const otherUser = await prisma.user.create({
        data: {
          ...createFixture(TEST_FIXTURES.user.admin),
          email: 'other@example.com',
          tenantId: otherTenant.id,
        },
      });

      const otherToken = server.jwt.sign({
        userId: otherUser.id,
        tenantId: otherTenant.id,
        role: otherUser.role,
      });

      const unauthorizedResponse = await request
        .get(`/api/v1/documents/${document.id}`)
        .set('authorization', `Bearer ${otherToken}`)
        .set('x-tenant-id', otherTenant.id);

      expect(unauthorizedResponse.status).toBe(404); // Should not reveal existence
    });
  });
});