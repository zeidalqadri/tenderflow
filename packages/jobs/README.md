# TenderFlow Jobs Package

A comprehensive document processing pipeline with OCR and receipt parsing capabilities for TenderFlow.

## Features

- **BullMQ Job Processing System** - Scalable queue-based job processing
- **OCR Integration** - Tesseract.js with multi-language support and preprocessing
- **Portal-Specific Extractors** - Specialized parsers for various procurement portals
- **File Processing Pipeline** - MinIO integration with metadata extraction
- **Alert Dispatch System** - Email, webhook, and push notification support
- **Rules Application Engine** - Automated categorization and validation
- **Comprehensive Monitoring** - Metrics collection and health monitoring

## Supported Portals

### zakup.sk.kz (Kazakhstan)
- Government procurement portal
- Multi-language support (Kazakh, Russian, English)
- BIN/IIN extraction for company identification
- Amount and currency parsing (KZT focus)

### EU TED (Tenders Electronic Daily)
- European Union procurement notices
- CPV and NUTS code extraction
- Multi-language support (EN, DE, FR, ES, IT)
- Notice number parsing (format: YYYY/S XXX-XXXXXX)

### Generic Email Parser
- Email-based submission confirmations
- Header extraction (From, To, Subject, Date)
- Submission ID and reference parsing
- Attachment mention detection

### PDF Invoice Parser
- Structured invoice/receipt parsing
- VAT and tax information extraction
- Vendor and customer information
- Multi-currency support

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Routes    │───→│   Job Queues    │───→│   Processors    │
│                 │    │                 │    │                 │
│ - Submissions   │    │ - Receipt Parse │    │ - OCR Service   │
│ - Documents     │    │ - File Process  │    │ - Extractors    │
│ - Monitoring    │    │ - Alert Dispatch│    │ - File Storage  │
└─────────────────┘    │ - Rules App     │    │ - Metrics       │
                       │ - OCR Process   │    └─────────────────┘
                       └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   Workers       │
                    │                 │
                    │ - Redis Queue   │
                    │ - MinIO Storage │
                    │ - PostgreSQL    │
                    └─────────────────┘
```

## Quick Start

### Installation

```bash
cd packages/jobs
npm install
```

### Environment Variables

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# MinIO Configuration
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=[SECURE_CREDENTIAL]
MINIO_SECRET_KEY=[SECURE_CREDENTIAL]
MINIO_DEFAULT_BUCKET=tenderflow-files
MINIO_THUMBNAIL_BUCKET=tenderflow-thumbnails

# SMTP Configuration
SMTP_HOST=localhost
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@tenderflow.com

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/tenderflow
```

### Basic Usage

```typescript
import { scheduleReceiptParse, getJobStatus } from '@tenderflow/jobs';

// Schedule a receipt parsing job
const jobId = await scheduleReceiptParse({
  submissionId: 'sub-123',
  receiptKey: 'receipts/document.pdf',
  tenantId: 'tenant-123',
  userId: 'user-123',
  metadata: {
    originalName: 'receipt.pdf',
    source: 'submission',
  },
});

// Check job status
const status = await getJobStatus('receipt-parse', jobId);
console.log('Job status:', status?.status);
```

### Starting Workers

```typescript
import { allWorkers } from '@tenderflow/jobs';

// Workers start automatically when imported
console.log(`Started ${allWorkers.length} workers`);
```

## API Reference

### Job Scheduling Functions

#### `scheduleReceiptParse(data, options?)`
Schedule a receipt parsing job.

**Parameters:**
- `data.submissionId` - ID of the submission
- `data.receiptKey` - MinIO key of the receipt file
- `data.tenantId` - Tenant ID
- `data.userId` - User ID
- `data.metadata` - Additional metadata

**Returns:** Promise<string> - Job ID

#### `scheduleFileProcess(data, options?)`
Schedule a file processing job.

#### `scheduleAlertDispatch(data, options?)`
Schedule an alert dispatch job.

#### `scheduleRulesApplication(data, options?)`
Schedule a rules application job.

#### `scheduleOcrProcess(data, options?)`
Schedule an OCR processing job.

### Services

#### OCR Service
```typescript
import { ocrService } from '@tenderflow/jobs';

const result = await ocrService.processImage(buffer, {
  language: ['eng', 'rus', 'kaz'],
  preprocessing: {
    denoise: true,
    contrast: true,
    resize: true,
  },
  confidence: 0.3,
});
```

#### File Storage Service
```typescript
import { fileStorageService } from '@tenderflow/jobs';

// Upload file
await fileStorageService.putFile('bucket', 'key', buffer);

// Download file
const buffer = await fileStorageService.getFile('bucket', 'key');

// Process file
const result = await fileStorageService.processFile('bucket', 'key', 'filename');
```

#### Metrics Collector
```typescript
import { metricsCollector } from '@tenderflow/jobs';

// Get system health
const health = await metricsCollector.getSystemHealth();

// Get job metrics
const metrics = await metricsCollector.getJobMetrics('receipt-parse');

// Export Prometheus metrics
const prometheus = metricsCollector.exportPrometheusMetrics();
```

## Extractors

### Creating Custom Extractors

```typescript
import { BaseExtractor, ExtractorContext, ExtractionResult } from '@tenderflow/jobs';

export class CustomExtractor extends BaseExtractor {
  readonly type = 'custom-portal';
  readonly version = '1.0.0';
  readonly supportedMimeTypes = ['application/pdf', 'text/plain'];

  canHandle(context: ExtractorContext): boolean {
    return context.ocrText?.includes('custom-portal-indicator') || false;
  }

  async extract(context: ExtractorContext): Promise<ExtractionResult> {
    // Implementation here
    return {
      success: true,
      confidence: 0.8,
      data: {
        // Extracted data
      },
      extractorType: this.type,
      extractorVersion: this.version,
      processingTime: 1000,
    };
  }
}

// Register the extractor
import { extractorRegistry } from '@tenderflow/jobs';
extractorRegistry.registerExtractor(new CustomExtractor());
```

### Available Extractors

- `ZakupSkKzExtractor` - Kazakhstan government procurement
- `EuTedExtractor` - EU Tenders Electronic Daily
- `GenericEmailExtractor` - Email receipt parsing
- `PdfInvoiceExtractor` - PDF invoice/receipt parsing

## Monitoring

### Health Check Endpoint

The system provides comprehensive health monitoring:

```typescript
const health = await metricsCollector.getSystemHealth();
```

Returns:
```json
{
  "status": "healthy",
  "services": {
    "redis": { "status": "healthy", "latency": 5 },
    "minio": { "status": "healthy", "available": true },
    "ocr": { "status": "healthy", "workersActive": 3 },
    "database": { "status": "healthy", "connectionPool": 10 }
  },
  "queues": {
    "receipt-parse": {
      "status": "healthy",
      "waiting": 5,
      "active": 2,
      "completed": 150,
      "failed": 3
    }
  },
  "resources": {
    "memory": { "used": 150000000, "total": 512000000, "percentage": 29.3 },
    "cpu": { "usage": 45.2 },
    "disk": { "used": 2147483648, "total": 10737418240, "percentage": 20.0 }
  },
  "uptime": 86400
}
```

### Metrics

The system collects detailed metrics:

- **Job Metrics**: Completion rates, processing times, throughput
- **Extractor Metrics**: Confidence scores, success rates, usage statistics
- **System Metrics**: Resource usage, queue health, service availability

### Prometheus Integration

```typescript
// Export metrics for Prometheus
const prometheus = metricsCollector.exportPrometheusMetrics();
```

## Testing

### Running Tests

```bash
npm test                # Run all tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage
```

### Test Structure

```
src/__tests__/
├── setup.ts              # Test setup and mocks
├── extractors.test.ts     # Extractor unit tests
├── processors.test.ts     # Processor unit tests
└── integration.test.ts    # Integration tests
```

### Sample Test Data

The test suite includes comprehensive sample data for all supported portals and document types.

## Performance

### Throughput

- **Receipt Parsing**: ~100 documents/minute (depends on OCR complexity)
- **File Processing**: ~200 files/minute
- **Alert Dispatch**: ~1000 alerts/minute
- **Rules Application**: ~500 tenders/minute

### Scaling

- **Horizontal**: Add more worker instances
- **Vertical**: Increase worker concurrency
- **Queue Sharding**: Distribute across multiple Redis instances
- **Resource Limits**: Configurable per-queue concurrency

### Optimization Tips

1. **OCR Preprocessing**: Enable for better accuracy but slower processing
2. **Concurrent Workers**: Balance between CPU usage and throughput
3. **Memory Management**: Monitor heap usage for large document processing
4. **Queue Priorities**: Use job priorities for urgent processing
5. **Retry Logic**: Configure appropriate backoff strategies

## Security

### File Validation

- File type detection and validation
- Size limits and restrictions
- Virus scanning integration ready
- Secure file storage with presigned URLs

### Access Control

- Tenant-based isolation
- User-based job authorization
- Audit logging for all operations
- Encrypted sensitive data in jobs

### Best Practices

1. Validate all input data
2. Use secure file storage
3. Implement rate limiting
4. Monitor for suspicious activity
5. Regular security updates

## Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["npm", "start"]
```

### Environment-Specific Configuration

- **Development**: Single worker, verbose logging
- **Staging**: Multiple workers, metrics collection
- **Production**: Full scaling, monitoring, alerts

### Monitoring in Production

1. Set up Prometheus metrics collection
2. Configure alerting for failed jobs
3. Monitor system resource usage
4. Set up log aggregation
5. Health check endpoints

## Troubleshooting

### Common Issues

#### OCR Processing Fails
- Check Tesseract.js installation
- Verify image preprocessing settings
- Monitor memory usage during processing
- Check supported languages configuration

#### File Processing Errors
- Verify MinIO connection and credentials
- Check bucket permissions and policies
- Monitor storage space and quotas
- Validate file types and sizes

#### Job Queue Issues
- Check Redis connection and memory
- Monitor queue depths and processing rates
- Verify worker process health
- Review job retry configurations

#### Extraction Accuracy Low
- Review extractor selection logic
- Improve OCR preprocessing
- Train custom extractors for specific formats
- Validate input document quality

### Debug Mode

```typescript
// Enable detailed logging
process.env.DEBUG = 'tenderflow:jobs:*';
```

### Performance Profiling

```typescript
// Enable metrics collection
metricsCollector.start(30000); // 30-second intervals

// Monitor specific extractors
const metrics = metricsCollector.getExtractorMetrics('zakup-sk-kz');
console.log('Extractor performance:', metrics);
```

## Contributing

1. Follow TypeScript best practices
2. Add comprehensive tests for new features
3. Update documentation
4. Consider performance implications
5. Test with sample documents

## License

MIT License - see LICENSE file for details.