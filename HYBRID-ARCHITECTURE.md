# TenderFlow Hybrid Architecture Documentation

## Overview

TenderFlow uses a hybrid cloud architecture where data collection (scraping) runs locally while all processing, storage, and user interfaces are deployed on Google Cloud Platform (GCP). This approach provides optimal security, scalability, and cost-effectiveness.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           LOCAL ENVIRONMENT                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────┐     ┌──────────────────┐    ┌─────────────────┐ │
│  │ Python Scraper   │────▶│ SQLite Queue    │────▶│ Cloud Uploader  │ │
│  │ (Selenium)       │     │ (Persistence)    │    │ (Circuit Breaker)│ │
│  └──────────────────┘     └──────────────────┘    └─────────────────┘ │
│           │                         │                        │          │
│           │                         │                        │          │
│  ┌──────────────────┐     ┌──────────────────┐             │          │
│  │ Redis Cache     │◀─────│ Health Monitor   │             │          │
│  │ (Local)         │      │ (Prometheus)     │             │          │
│  └──────────────────┘     └──────────────────┘             │          │
│                                     │                        │          │
└─────────────────────────────────────┼────────────────────────┼──────────┘
                                      │                        │
                           HTTPS + mTLS│              Metrics Export
                                      ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         GOOGLE CLOUD PLATFORM                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────┐     ┌──────────────────┐    ┌─────────────────┐ │
│  │ Cloud Armor     │────▶│ API Gateway      │────▶│ Cloud Run API   │ │
│  │ (DDoS/WAF)      │     │ (Rate Limiting)  │    │ (Ingestion)     │ │
│  └──────────────────┘     └──────────────────┘    └─────────────────┘ │
│                                                             │          │
│                                                             ▼          │
│  ┌──────────────────┐     ┌──────────────────┐    ┌─────────────────┐ │
│  │ Cloud SQL       │◀─────│ Cloud Run API    │────▶│ Cloud Pub/Sub  │ │
│  │ (PostgreSQL)    │      │ (Fastify)        │    │ (Events)       │ │
│  └──────────────────┘     └──────────────────┘    └─────────────────┘ │
│           │                         │                        │          │
│           │                         ▼                        ▼          │
│  ┌──────────────────┐     ┌──────────────────┐    ┌─────────────────┐ │
│  │ Memorystore     │◀─────│ Cloud Run Web    │    │ Cloud Tasks    │ │
│  │ (Redis)         │      │ (Next.js)        │    │ (Processing)   │ │
│  └──────────────────┘     └──────────────────┘    └─────────────────┘ │
│                                     │                        │          │
│                            ┌──────────────────┐    ┌─────────────────┐ │
│                            │ Cloud Storage    │    │ Cloud Monitoring│ │
│                            │ (Documents)      │    │ (Metrics)       │ │
│                            └──────────────────┘    └─────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Components

### Local Components (On-Premises)

#### 1. Python Scraper (`/scraper`)
- **Technology**: Python 3.9+, Selenium, BeautifulSoup
- **Purpose**: Extract tender data from government portals
- **Key Features**:
  - Multi-threaded scraping with configurable concurrency
  - Intelligent retry logic with exponential backoff
  - Session management and cookie handling
  - Anti-detection measures (user-agent rotation, delays)

#### 2. SQLite Queue (`/scraper/upload_queue.db`)
- **Purpose**: Persistent job queue for upload reliability
- **Schema**:
  ```sql
  CREATE TABLE upload_jobs (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    created_at TIMESTAMP,
    next_retry_at TIMESTAMP,
    error_message TEXT
  );
  ```

#### 3. Cloud Uploader (`/scraper/cloud_uploader.py`)
- **Purpose**: Reliable data transmission to GCP
- **Key Features**:
  - Circuit breaker pattern for failure handling
  - Checksum validation for data integrity
  - Batch processing with compression
  - Automatic retry with exponential backoff

#### 4. Local Monitoring
- **Prometheus**: Metrics collection (port 9090)
- **Grafana**: Visualization dashboards (port 3001)
- **Redis**: Local caching and rate limiting (port 6380)

### Cloud Components (GCP)

#### 1. Ingestion API (`/apps/api/src/routes/ingestion.ts`)
- **Endpoints**:
  - `POST /api/ingestion/tenders` - Receive scraped data
  - `GET /api/ingestion/status/:uploadId` - Check upload status
  - `GET /api/ingestion/health` - Health check
  - `GET /api/ingestion/metrics` - Scraper metrics

#### 2. Data Storage
- **Cloud SQL PostgreSQL**: Primary database
- **Cloud Storage**: Document and file storage
- **Memorystore Redis**: Caching and session management

#### 3. Processing Pipeline
- **Cloud Pub/Sub**: Event messaging
- **Cloud Tasks**: Asynchronous job processing
- **Cloud Functions**: Serverless processing units

#### 4. Security Layer
- **Cloud Armor**: DDoS protection and WAF
- **Cloud KMS**: Encryption key management
- **Secret Manager**: Credential storage
- **Identity-Aware Proxy**: Access control

## Data Flow

### 1. Scraping Phase (Local)
```python
# Scraper extracts data from portal
tenders = scraper.extract_tenders(portal_url)

# Data is validated and formatted
validated_data = validator.validate(tenders)

# Creates batch with metadata
batch = {
    'tenders': validated_data,
    'metadata': {
        'scraperId': SCRAPER_ID,
        'batchId': generate_batch_id(),
        'scrapedAt': datetime.now().isoformat(),
        'checksum': calculate_checksum(validated_data)
    }
}

# Queued for upload
upload_queue.enqueue(batch)
```

### 2. Upload Phase (Local → Cloud)
```python
# Circuit breaker checks service health
if circuit_breaker.is_open():
    wait_for_recovery()

# Upload with authentication
response = requests.post(
    f"{API_URL}/api/ingestion/tenders",
    json=batch,
    headers={
        'Authorization': f'Bearer {SCRAPER_TOKEN}',
        'X-Correlation-Id': correlation_id
    }
)

# Handle response
if response.status_code == 200:
    mark_success(batch_id)
else:
    schedule_retry(batch_id)
```

### 3. Ingestion Phase (Cloud)
```typescript
// Validate authentication
const scraperAuth = await validateScraperToken(request);

// Verify data integrity
const checksum = calculateChecksum(tenders);
if (checksum !== metadata.checksum) {
    throw new Error('Checksum mismatch');
}

// Process tenders
for (const tender of tenders) {
    // Check for duplicates
    const existing = await findExistingTender(tender);
    
    if (!existing) {
        // Create new tender
        await prisma.tender.create({
            data: sanitizeTender(tender)
        });
    } else {
        // Update existing
        await prisma.tender.update({
            where: { id: existing.id },
            data: sanitizeTender(tender)
        });
    }
}

// Emit events for downstream processing
await pubsub.publish('tender-ingested', {
    uploadId,
    batchId,
    tendersCount: processed
});
```

## Security Architecture

### Authentication Flow
```
┌─────────┐      ┌──────────┐      ┌──────────┐
│ Scraper │─────▶│   API    │─────▶│  Auth    │
│         │◀─────│ Gateway  │◀─────│ Service  │
└─────────┘      └──────────┘      └──────────┘
    │                 │                  │
    │   JWT Token     │    Validate      │
    └─────────────────┼──────────────────┘
                      │
                ┌──────────┐
                │   KMS    │
                └──────────┘
```

### Security Controls

1. **Network Security**
   - mTLS for scraper-to-cloud communication
   - VPC with private subnets for cloud resources
   - Cloud Armor for DDoS protection

2. **Authentication & Authorization**
   - JWT tokens with short expiry (15 minutes)
   - Service account based authentication
   - Role-based access control (RBAC)

3. **Data Protection**
   - Encryption at rest (Cloud KMS)
   - Encryption in transit (TLS 1.3)
   - Data sanitization and validation

4. **Rate Limiting**
   - Per-scraper limits: 100 requests/minute
   - Global limits: 1000 requests/minute
   - Circuit breaker for automatic failure handling

## Monitoring & Observability

### Metrics Collection

#### Local Metrics (OpenTelemetry)
```python
# CPU and Memory usage
monitor.record_metric('scraper.resource.cpu', cpu_percent)
monitor.record_metric('scraper.resource.memory', memory_mb)

# Scraping metrics
monitor.record_metric('scraper.tenders.scraped', count)
monitor.record_metric('scraper.operation.duration', duration_ms)

# Upload metrics
monitor.record_metric('scraper.uploads.success', 1)
monitor.record_metric('scraper.queue.depth', queue_size)
```

#### Cloud Metrics (Cloud Monitoring)
```typescript
// Ingestion metrics
monitoring.recordMetric('ingestion_tenders_received', count);
monitoring.recordMetric('ingestion_processing_time_ms', duration);
monitoring.recordMetric('ingestion_validation_failures', failures);

// API metrics
monitoring.recordMetric('api_request_count', 1);
monitoring.recordMetric('api_request_duration_ms', responseTime);
```

### Dashboards

1. **Ingestion Pipeline Dashboard**
   - Success rate and throughput
   - Processing time (P50, P95, P99)
   - Queue depth and circuit breaker status
   - Error rates and validation failures

2. **Scraper Health Dashboard**
   - Resource utilization (CPU, Memory, Disk)
   - Scraping success/failure rates
   - Network connectivity status
   - Upload queue backlog

### Alerts

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| High Failure Rate | Success < 90% for 10min | Critical | Check API health, review logs |
| Circuit Breaker Open | State = Open for 2min | Critical | Investigate API issues |
| High Queue Depth | Depth > 100 for 15min | Warning | Scale resources, check throughput |
| No Data Received | 0 tenders for 30min | Critical | Check scraper status |
| High Resource Usage | CPU > 80% for 10min | Warning | Restart scraper, check for leaks |

## Deployment

### Prerequisites
- GCP Project with billing enabled
- Docker and Docker Compose installed
- Terraform >= 1.0
- gcloud CLI configured
- Python 3.9+ for local scraper

### Quick Start

1. **Clone Repository**
   ```bash
   git clone https://github.com/tenderflow/sustender.git
   cd sustender
   ```

2. **Configure Environment**
   ```bash
   export GCP_PROJECT_ID="your-project-id"
   export GCP_REGION="us-central1"
   ```

3. **Run Deployment Script**
   ```bash
   ./deployment/scripts/deploy-hybrid.sh
   ```

4. **Verify Deployment**
   ```bash
   # Check API health
   curl https://api.tenderflow.app/api/ingestion/health
   
   # Check local scraper
   curl http://localhost:8080/health
   
   # View monitoring
   open http://localhost:3001  # Grafana
   ```

### Manual Deployment Steps

#### 1. Deploy GCP Infrastructure
```bash
cd deployment/terraform
terraform init
terraform plan -var="project_id=$GCP_PROJECT_ID"
terraform apply
```

#### 2. Build and Deploy Services
```bash
# Build images
docker build -t gcr.io/$GCP_PROJECT_ID/tenderflow-api:latest -f apps/api/Dockerfile .
docker build -t gcr.io/$GCP_PROJECT_ID/tenderflow-web:latest -f apps/web/Dockerfile .

# Push to registry
docker push gcr.io/$GCP_PROJECT_ID/tenderflow-api:latest
docker push gcr.io/$GCP_PROJECT_ID/tenderflow-web:latest

# Deploy to Cloud Run
gcloud run deploy tenderflow-api --image gcr.io/$GCP_PROJECT_ID/tenderflow-api:latest
gcloud run deploy tenderflow-web --image gcr.io/$GCP_PROJECT_ID/tenderflow-web:latest
```

#### 3. Setup Local Scraper
```bash
cd deployment
docker-compose -f docker-compose.hybrid.yml up -d

cd ../scraper
pip install -r requirements.txt
python main.py --enable-monitoring
```

## Operations

### Daily Tasks
- [ ] Review monitoring dashboards
- [ ] Check alert notifications
- [ ] Verify backup completion
- [ ] Review error logs

### Weekly Tasks
- [ ] Performance analysis
- [ ] Cost optimization review
- [ ] Security audit logs
- [ ] Update scraper patterns

### Monthly Tasks
- [ ] Disaster recovery test
- [ ] Security compliance audit
- [ ] Dependency updates
- [ ] Capacity planning

## Troubleshooting

### Common Issues

#### 1. Scraper Cannot Connect to API
```bash
# Check network connectivity
curl -I https://api.tenderflow.app/api/ingestion/health

# Verify authentication token
echo $TENDERFLOW_API_KEY | jwt decode

# Check firewall rules
gcloud compute firewall-rules list
```

#### 2. High Upload Failure Rate
```bash
# Check circuit breaker state
curl http://localhost:8080/metrics | grep circuit_breaker

# Review error logs
docker logs tenderflow-scraper --tail 100

# Check API rate limits
gcloud monitoring metrics list --filter="metric.type=ingestion"
```

#### 3. Data Not Appearing in Database
```sql
-- Check ingestion logs
SELECT * FROM scraping_logs 
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Verify tender processing
SELECT COUNT(*), status 
FROM tenders 
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY status;
```

## Cost Optimization

### Estimated Monthly Costs

| Service | Configuration | Cost |
|---------|--------------|------|
| Cloud Run API | 2 vCPU, 4GB RAM | $150-300 |
| Cloud Run Web | 1 vCPU, 2GB RAM | $100-200 |
| Cloud SQL | db-standard-2, 100GB | $106 |
| Memorystore | 4GB Redis HA | $150 |
| Cloud Storage | 100GB | $50 |
| Monitoring | Metrics & Logs | $75 |
| **Total** | | **$631-881/month** |

### Optimization Strategies
1. Use committed use discounts (25-52% savings)
2. Configure auto-scaling to scale to zero
3. Archive old documents to cold storage
4. Use regional resources to avoid egress charges
5. Implement intelligent log sampling

## Support

### Resources
- [Architecture Diagrams](./docs/architecture)
- [API Documentation](./docs/api)
- [Monitoring Playbooks](./docs/playbooks)
- [Security Policies](./docs/security)

### Contact
- **Engineering Team**: engineering@tenderflow.app
- **On-Call**: Use PagerDuty escalation
- **Security Issues**: security@tenderflow.app

## License

Copyright (c) 2025 TenderFlow. All rights reserved.