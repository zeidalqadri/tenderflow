# Ingestion Pipeline Operational Runbook

## Overview
This runbook provides procedures for operating and troubleshooting the TenderFlow hybrid ingestion pipeline.

## Architecture Components
- **Local Scraper**: Python application running on-premises
- **Cloud Uploader**: Module handling data transmission to GCP
- **Ingestion API**: Cloud Run service receiving scraped data
- **Database**: Cloud SQL PostgreSQL storing tender data
- **Monitoring**: Prometheus (local) + Cloud Monitoring (GCP)

---

## 🚨 Emergency Procedures

### Complete Pipeline Failure
**Symptoms**: No data flowing from scraper to database for >30 minutes

**Immediate Actions**:
1. Check scraper health: `curl http://localhost:8080/health`
2. Check API health: `curl https://api.tenderflow.app/api/ingestion/health`
3. Check circuit breaker state: `curl http://localhost:8080/status | jq .uploader_health`

**Resolution**:
```bash
# Restart scraper
docker-compose -f deployment/docker-compose.hybrid.yml restart scraper

# If circuit breaker is open, reset it
curl -X POST http://localhost:8080/reset-circuit-breaker

# Process pending queue
cd scraper && python cloud_uploader.py --process-queue
```

### Authentication Failures
**Symptoms**: 401 or 403 errors in scraper logs

**Immediate Actions**:
```bash
# Check token validity
echo $TENDERFLOW_API_KEY | jwt decode

# Regenerate token if expired
./deployment/scripts/refresh-scraper-token.sh

# Update scraper configuration
docker-compose -f deployment/docker-compose.hybrid.yml restart scraper
```

### Database Connection Issues
**Symptoms**: Database connection errors in API logs

**Immediate Actions**:
```bash
# Check Cloud SQL status
gcloud sql instances describe tenderflow-db --format="value(state)"

# Restart Cloud SQL proxy
kubectl rollout restart deployment/cloud-sql-proxy

# Check connection pool
gcloud sql operations list --instance=tenderflow-db --limit=5
```

---

## 📊 Monitoring Procedures

### Daily Health Checks

#### Morning Check (9 AM)
```bash
# 1. Check scraper status
curl http://localhost:8080/health | jq .

# 2. Check overnight scraping results
curl http://localhost:8080/metrics | jq '.metrics.last_24h'

# 3. Review error logs
docker logs tenderflow-scraper --since 24h | grep ERROR

# 4. Check queue depth
curl http://localhost:8080/status | jq '.uploader_health.queue_size'

# 5. Verify GCP metrics
gcloud monitoring metrics-descriptors list \
  --filter="metric.type:custom.googleapis.com/tenderflow/*" \
  --format="table(type,displayName)"
```

#### Evening Check (6 PM)
```bash
# 1. Review daily metrics dashboard
open http://localhost:3001/d/ingestion-pipeline

# 2. Check alert status
gcloud alpha monitoring policies list --filter="enabled:true"

# 3. Verify backup completion
gcloud sql backups list --instance=tenderflow-db --limit=1

# 4. Review cost metrics
gcloud billing budgets list
```

### Performance Monitoring

#### Check Processing Times
```sql
-- Average processing time by hour
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_seconds,
    COUNT(*) as batches
FROM scraping_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

#### Check Success Rates
```sql
-- Success rate by portal
SELECT 
    source_portal,
    COUNT(*) FILTER (WHERE status = 'COMPLETED') as successful,
    COUNT(*) as total,
    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'COMPLETED') / COUNT(*), 2) as success_rate
FROM scraping_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY source_portal
ORDER BY success_rate ASC;
```

---

## 🔧 Troubleshooting Guide

### Issue: High Queue Depth
**Symptoms**: Queue depth > 100 items for extended period

**Diagnosis**:
```bash
# Check upload rate
curl http://localhost:8080/metrics | jq '.upload_metrics'

# Check API latency
curl -w "\n%{time_total}\n" https://api.tenderflow.app/api/ingestion/health

# Check for rate limiting
docker logs tenderflow-scraper --tail 100 | grep "429"
```

**Resolution**:
1. Increase upload concurrency:
   ```bash
   export MAX_UPLOAD_WORKERS=5
   docker-compose -f deployment/docker-compose.hybrid.yml restart scraper
   ```

2. Scale API resources:
   ```bash
   gcloud run services update tenderflow-api --max-instances=200
   ```

3. Process queue manually:
   ```python
   python -c "
   from cloud_uploader import CloudUploader
   uploader = CloudUploader('https://api.tenderflow.app')
   uploader.process_queue()
   "
   ```

### Issue: Data Validation Failures
**Symptoms**: High validation failure rate in metrics

**Diagnosis**:
```sql
-- Find validation error patterns
SELECT 
    metadata->>'error' as error_type,
    COUNT(*) as occurrences
FROM scraping_logs
WHERE status = 'FAILED'
    AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY error_type
ORDER BY occurrences DESC;
```

**Resolution**:
1. Review scraper selectors:
   ```python
   # Test selectors
   cd scraper
   python debug_selectors.py --portal problematic_portal
   ```

2. Update validation rules:
   ```typescript
   // apps/api/src/routes/ingestion.ts
   // Adjust validation schema as needed
   ```

3. Regenerate checksums:
   ```python
   # Fix checksum calculation
   python scripts/fix_checksums.py --batch-id <batch_id>
   ```

### Issue: Memory Leaks in Scraper
**Symptoms**: Increasing memory usage over time

**Diagnosis**:
```bash
# Monitor memory usage
docker stats tenderflow-scraper

# Check for zombie processes
ps aux | grep chrome | grep defunct

# Analyze memory profile
python -m memory_profiler scraper/main.py --profile
```

**Resolution**:
1. Restart scraper periodically:
   ```bash
   # Add to crontab
   0 */6 * * * docker-compose -f /path/to/docker-compose.hybrid.yml restart scraper
   ```

2. Fix Chrome driver cleanup:
   ```python
   # Ensure proper cleanup in scraper
   def cleanup_driver(driver):
       driver.quit()
       os.system("pkill -f chromium")
   ```

### Issue: Circuit Breaker Stuck Open
**Symptoms**: Circuit breaker remains open despite API being healthy

**Diagnosis**:
```python
# Check circuit breaker state
import requests
status = requests.get('http://localhost:8080/status').json()
print(f"Circuit state: {status['uploader_health']['circuit_breaker_state']}")
print(f"Failure count: {status['uploader_health']['failure_count']}")
```

**Resolution**:
```python
# Manual reset
from cloud_uploader import CloudUploader
uploader = CloudUploader('https://api.tenderflow.app')
uploader.circuit_breaker.state = 'closed'
uploader.circuit_breaker.failure_count = 0
print("Circuit breaker reset")
```

---

## 📈 Scaling Procedures

### Horizontal Scaling

#### Scale Scraper Instances
```bash
# Deploy additional scraper
docker run -d \
  --name tenderflow-scraper-02 \
  --env-file scraper/.env \
  -e TENDERFLOW_SCRAPER_ID=scraper-02 \
  gcr.io/project/tenderflow-scraper:latest
```

#### Scale API Instances
```bash
# Increase Cloud Run instances
gcloud run services update tenderflow-api \
  --min-instances=5 \
  --max-instances=500 \
  --concurrency=500
```

### Vertical Scaling

#### Upgrade Database
```bash
# Scale up Cloud SQL
gcloud sql instances patch tenderflow-db \
  --tier=db-standard-4 \
  --cpu=4 \
  --memory=16GB
```

#### Increase Scraper Resources
```yaml
# docker-compose.hybrid.yml
services:
  scraper:
    deploy:
      resources:
        limits:
          cpus: '4.0'
          memory: 8G
```

---

## 🔄 Maintenance Procedures

### Weekly Maintenance

#### 1. Database Maintenance
```sql
-- Analyze tables for query optimization
ANALYZE tenders;
ANALYZE scraping_logs;

-- Vacuum to reclaim space
VACUUM ANALYZE;

-- Check index usage
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan;
```

#### 2. Log Rotation
```bash
# Rotate scraper logs
find /app/logs -name "*.log" -mtime +7 -delete

# Archive GCP logs
gcloud logging sinks create archive-sink \
  storage.googleapis.com/tenderflow-logs-archive \
  --log-filter="timestamp < \"$(date -d '30 days ago' --iso-8601)\""
```

#### 3. Queue Cleanup
```sql
-- Clean completed jobs older than 7 days
DELETE FROM upload_jobs 
WHERE status = 'completed' 
  AND created_at < NOW() - INTERVAL '7 days';

-- Reset failed jobs for retry
UPDATE upload_jobs 
SET status = 'pending', attempts = 0
WHERE status = 'failed' 
  AND created_at > NOW() - INTERVAL '24 hours';
```

### Monthly Maintenance

#### 1. Security Audit
```bash
# Check for vulnerabilities
cd scraper && pip-audit

# Update dependencies
pip install --upgrade -r requirements.txt

# Rotate API keys
./scripts/rotate-credentials.sh
```

#### 2. Performance Review
```python
# Generate performance report
python scripts/generate_performance_report.py \
  --start-date $(date -d '30 days ago' +%Y-%m-%d) \
  --end-date $(date +%Y-%m-%d) \
  --output reports/monthly_performance.pdf
```

#### 3. Cost Optimization
```bash
# Review resource utilization
gcloud recommender recommendations list \
  --project=$PROJECT_ID \
  --location=global \
  --recommender=google.compute.instance.MachineTypeRecommender

# Identify unused resources
gcloud compute instances list --filter="status=TERMINATED"
```

---

## 📝 Incident Response

### Incident Classification

| Severity | Impact | Response Time | Examples |
|----------|--------|--------------|----------|
| P0 - Critical | Complete outage | 15 minutes | Database down, API unreachable |
| P1 - High | Major degradation | 30 minutes | >50% failure rate, Auth broken |
| P2 - Medium | Partial impact | 2 hours | Slow processing, Some portals failing |
| P3 - Low | Minor issues | 24 hours | UI issues, Non-critical alerts |

### Incident Response Process

#### 1. Detection
- Automated alerts via Cloud Monitoring
- Manual detection via dashboards
- User reports

#### 2. Triage
```bash
# Quick assessment
./scripts/incident-triage.sh

# Outputs:
# - System status
# - Recent errors
# - Performance metrics
# - Recommended severity
```

#### 3. Communication
```bash
# Update status page
curl -X POST https://status.tenderflow.app/api/incidents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Ingestion Pipeline Degradation",
    "severity": "P1",
    "status": "investigating",
    "message": "We are investigating issues with data ingestion"
  }'
```

#### 4. Resolution
- Follow specific runbook procedures
- Document actions taken
- Test fixes in staging first (if time permits)

#### 5. Post-Incident Review
```markdown
## Incident Report Template

### Summary
- **Date/Time**: 
- **Duration**: 
- **Severity**: 
- **Impact**: 

### Timeline
- Detection:
- Response:
- Resolution:
- All-clear:

### Root Cause
[Detailed explanation]

### Resolution
[Steps taken to resolve]

### Lessons Learned
- What went well:
- What could be improved:

### Action Items
- [ ] Update monitoring
- [ ] Update documentation
- [ ] Fix root cause
```

---

## 🔐 Security Procedures

### API Key Rotation
```bash
# Generate new API key
NEW_KEY=$(openssl rand -hex 32)

# Update Secret Manager
gcloud secrets versions add scraper-api-key --data-text="$NEW_KEY"

# Update local scraper
echo "TENDERFLOW_API_KEY=$NEW_KEY" >> scraper/.env
docker-compose restart scraper
```

### SSL Certificate Renewal
```bash
# Check certificate expiry
echo | openssl s_client -connect api.tenderflow.app:443 2>/dev/null | \
  openssl x509 -noout -enddate

# Renew if needed
gcloud compute ssl-certificates create tenderflow-cert-$(date +%Y%m%d) \
  --domains=api.tenderflow.app,app.tenderflow.app
```

### Security Audit
```bash
# Run security scan
gcloud container images scan tenderflow-api:latest

# Check IAM permissions
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --format="table(bindings.role)"

# Review recent auth failures
gcloud logging read "severity=ERROR AND textPayload:'Authentication failed'" \
  --limit=50 \
  --format=json
```

---

## 📞 Contacts

### Escalation Matrix

| Level | Role | Contact | When to Contact |
|-------|------|---------|-----------------|
| L1 | On-Call Engineer | PagerDuty | First response, all incidents |
| L2 | Team Lead | Slack: #incidents | P0-P1 incidents, escalations |
| L3 | Engineering Manager | Phone | P0 incidents >30min |
| L4 | VP Engineering | Phone | Major outages >1hr |

### External Contacts

- **GCP Support**: 1-855-817-9001 (Premium Support)
- **Domain Registrar**: support@registrar.com
- **Security Team**: security@tenderflow.app

---

## 📚 Additional Resources

- [Architecture Documentation](../architecture/hybrid-deployment.md)
- [API Documentation](../api/ingestion-endpoints.md)
- [Security Policies](../security/ingestion-security.md)
- [Monitoring Dashboards](http://localhost:3001)
- [GCP Console](https://console.cloud.google.com)

---

*Last Updated: January 2025*
*Version: 1.0*