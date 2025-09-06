"""
Cloud Uploader Module for TenderFlow Scraper
Handles secure data upload from local scraper to GCP ingestion endpoints
"""

import os
import json
import time
import requests
import hashlib
import uuid
import logging
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timedelta
from pathlib import Path
import sqlite3
import threading
from enum import Enum
from dataclasses import dataclass, asdict
import gzip

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class UploadStatus(Enum):
    """Upload job status"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRY = "retry"


class CircuitState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Circuit is open, failing fast
    HALF_OPEN = "half_open"  # Testing if service is back


@dataclass
class UploadJob:
    """Represents an upload job"""
    id: str
    file_path: str
    batch_id: str
    status: UploadStatus
    attempts: int = 0
    max_attempts: int = 5
    created_at: datetime = None
    next_retry_at: datetime = None
    error_message: str = None
    metadata: Dict[str, Any] = None


class CircuitBreaker:
    """Circuit breaker for handling failures"""
    
    def __init__(self, failure_threshold: int = 5, recovery_timeout: int = 60):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.last_failure_time = None
        self.state = CircuitState.CLOSED
        self.lock = threading.Lock()
    
    def call(self, func, *args, **kwargs):
        """Execute function with circuit breaker protection"""
        with self.lock:
            if self.state == CircuitState.OPEN:
                if self._should_attempt_reset():
                    self.state = CircuitState.HALF_OPEN
                    logger.info("Circuit breaker entering HALF_OPEN state")
                else:
                    raise Exception("Circuit breaker is OPEN")
        
        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise e
    
    def _should_attempt_reset(self) -> bool:
        """Check if circuit should attempt reset"""
        if self.last_failure_time is None:
            return False
        
        time_since_failure = (datetime.now() - self.last_failure_time).total_seconds()
        return time_since_failure >= self.recovery_timeout
    
    def _on_success(self):
        """Handle successful call"""
        with self.lock:
            self.failure_count = 0
            if self.state != CircuitState.CLOSED:
                logger.info(f"Circuit breaker state changed from {self.state} to CLOSED")
            self.state = CircuitState.CLOSED
    
    def _on_failure(self):
        """Handle failed call"""
        with self.lock:
            self.failure_count += 1
            self.last_failure_time = datetime.now()
            
            if self.failure_count >= self.failure_threshold:
                if self.state != CircuitState.OPEN:
                    logger.warning(f"Circuit breaker OPEN after {self.failure_count} failures")
                self.state = CircuitState.OPEN


class UploadQueue:
    """Persistent queue for upload jobs"""
    
    def __init__(self, db_path: str = "upload_queue.db"):
        self.db_path = db_path
        self.lock = threading.Lock()
        self._init_database()
    
    def _init_database(self):
        """Initialize SQLite database"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS upload_jobs (
                    id TEXT PRIMARY KEY,
                    file_path TEXT NOT NULL,
                    batch_id TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    attempts INTEGER DEFAULT 0,
                    max_attempts INTEGER DEFAULT 5,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    next_retry_at TIMESTAMP,
                    error_message TEXT,
                    metadata TEXT
                )
            ''')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_status ON upload_jobs(status)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_batch ON upload_jobs(batch_id)')
    
    def enqueue(self, file_path: str, batch_id: str, metadata: Dict[str, Any] = None) -> str:
        """Add job to queue"""
        job_id = str(uuid.uuid4())
        
        with self.lock:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('''
                    INSERT INTO upload_jobs 
                    (id, file_path, batch_id, status, created_at, metadata)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (
                    job_id, file_path, batch_id, UploadStatus.PENDING.value,
                    datetime.now(), json.dumps(metadata) if metadata else None
                ))
        
        logger.info(f"Enqueued upload job {job_id} for file {file_path}")
        return job_id
    
    def get_next_jobs(self, limit: int = 10) -> List[UploadJob]:
        """Get next jobs to process"""
        with self.lock:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.execute('''
                    SELECT * FROM upload_jobs 
                    WHERE status IN ('pending', 'retry') 
                    AND (next_retry_at IS NULL OR next_retry_at <= ?)
                    ORDER BY created_at ASC
                    LIMIT ?
                ''', (datetime.now(), limit))
                
                jobs = []
                for row in cursor:
                    job = UploadJob(
                        id=row['id'],
                        file_path=row['file_path'],
                        batch_id=row['batch_id'],
                        status=UploadStatus(row['status']),
                        attempts=row['attempts'],
                        max_attempts=row['max_attempts'],
                        created_at=datetime.fromisoformat(row['created_at']) if row['created_at'] else None,
                        next_retry_at=datetime.fromisoformat(row['next_retry_at']) if row['next_retry_at'] else None,
                        error_message=row['error_message'],
                        metadata=json.loads(row['metadata']) if row['metadata'] else None
                    )
                    jobs.append(job)
                
                return jobs
    
    def update_job_status(self, job_id: str, status: UploadStatus, 
                         error_message: str = None, next_retry_at: datetime = None):
        """Update job status"""
        with self.lock:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('''
                    UPDATE upload_jobs 
                    SET status = ?, error_message = ?, next_retry_at = ?
                    WHERE id = ?
                ''', (status.value, error_message, next_retry_at, job_id))
    
    def increment_attempts(self, job_id: str):
        """Increment job attempt counter"""
        with self.lock:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('''
                    UPDATE upload_jobs 
                    SET attempts = attempts + 1
                    WHERE id = ?
                ''', (job_id,))


class CloudUploader:
    """Handles upload to GCP Cloud Run endpoints"""
    
    def __init__(self, base_url: str, api_key: str = None, scraper_id: str = None):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key or os.environ.get('TENDERFLOW_API_KEY')
        self.scraper_id = scraper_id or os.environ.get('TENDERFLOW_SCRAPER_ID', 'local-scraper')
        self.session = requests.Session()
        self.circuit_breaker = CircuitBreaker()
        self.upload_queue = UploadQueue()
        
        # Configure session
        if self.api_key:
            self.session.headers.update({
                'Authorization': f'Bearer {self.api_key}'
            })
        
        self.session.headers.update({
            'User-Agent': 'TenderFlow-Scraper/1.0',
            'Content-Type': 'application/json'
        })
    
    def upload_file(self, file_path: str, batch_id: str = None) -> Tuple[bool, Optional[str]]:
        """Upload file to cloud endpoint"""
        if not batch_id:
            batch_id = str(uuid.uuid4())
        
        # Add to queue
        job_id = self.upload_queue.enqueue(file_path, batch_id)
        
        # Process immediately
        return self._process_upload_job(job_id)
    
    def _process_upload_job(self, job_id: str) -> Tuple[bool, Optional[str]]:
        """Process a single upload job"""
        jobs = self.upload_queue.get_next_jobs(limit=1)
        if not jobs:
            return False, "Job not found"
        
        job = jobs[0]
        
        # Check if file exists
        if not os.path.exists(job.file_path):
            self.upload_queue.update_job_status(job.id, UploadStatus.FAILED, "File not found")
            return False, "File not found"
        
        # Load and prepare data
        try:
            with open(job.file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Calculate checksum
            data_string = json.dumps(data.get('tenders', []))
            checksum = hashlib.sha256(data_string.encode()).hexdigest()
            
            # Prepare payload
            payload = {
                'tenders': data.get('tenders', []),
                'metadata': {
                    'scraperId': self.scraper_id,
                    'batchId': job.batch_id,
                    'scrapedAt': data.get('metadata', {}).get('created_at', datetime.now().isoformat()),
                    'checksum': checksum,
                    'pageNumber': data.get('metadata', {}).get('page_number'),
                    'totalPages': data.get('metadata', {}).get('total_pages')
                }
            }
            
            # Upload with retry
            success, error = self._upload_with_retry(payload, job)
            
            if success:
                self.upload_queue.update_job_status(job.id, UploadStatus.COMPLETED)
                logger.info(f"Successfully uploaded job {job.id}")
                return True, None
            else:
                if job.attempts >= job.max_attempts:
                    self.upload_queue.update_job_status(job.id, UploadStatus.FAILED, error)
                    logger.error(f"Job {job.id} failed after {job.attempts} attempts: {error}")
                else:
                    # Schedule retry
                    next_retry = datetime.now() + timedelta(seconds=self._calculate_backoff(job.attempts))
                    self.upload_queue.update_job_status(job.id, UploadStatus.RETRY, error, next_retry)
                    logger.warning(f"Job {job.id} scheduled for retry at {next_retry}")
                
                return False, error
                
        except Exception as e:
            error_msg = str(e)
            self.upload_queue.update_job_status(job.id, UploadStatus.FAILED, error_msg)
            logger.error(f"Failed to process job {job.id}: {error_msg}")
            return False, error_msg
    
    def _upload_with_retry(self, payload: Dict[str, Any], job: UploadJob) -> Tuple[bool, Optional[str]]:
        """Upload with circuit breaker and retry logic"""
        for attempt in range(job.max_attempts - job.attempts):
            try:
                # Use circuit breaker
                response = self.circuit_breaker.call(
                    self._make_upload_request, payload
                )
                
                if response.get('status') == 'completed':
                    return True, None
                else:
                    return False, response.get('error', 'Unknown error')
                    
            except Exception as e:
                error_msg = str(e)
                logger.warning(f"Upload attempt {attempt + 1} failed: {error_msg}")
                
                if attempt < job.max_attempts - job.attempts - 1:
                    wait_time = self._calculate_backoff(attempt)
                    logger.info(f"Retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
                else:
                    return False, error_msg
        
        return False, "Max attempts exceeded"
    
    def _make_upload_request(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Make actual HTTP request to upload endpoint"""
        url = f"{self.base_url}/api/ingestion/tenders"
        
        response = self.session.post(url, json=payload, timeout=30)
        
        if response.status_code in [200, 201, 202]:
            return response.json()
        elif response.status_code == 429:
            # Rate limited
            retry_after = response.headers.get('Retry-After', 60)
            raise Exception(f"Rate limited. Retry after {retry_after} seconds")
        elif response.status_code >= 500:
            # Server error - should retry
            raise Exception(f"Server error: {response.status_code}")
        else:
            # Client error - should not retry
            return {'status': 'failed', 'error': f"Client error: {response.text}"}
    
    def _calculate_backoff(self, attempt: int) -> float:
        """Calculate exponential backoff with jitter"""
        base_delay = 2 ** attempt
        max_delay = 300  # 5 minutes max
        jitter = base_delay * 0.1 * (2 * os.urandom(1)[0] / 255 - 1)  # ±10% jitter
        
        return min(base_delay + jitter, max_delay)
    
    def process_queue(self):
        """Process all pending jobs in queue"""
        while True:
            jobs = self.upload_queue.get_next_jobs(limit=10)
            
            if not jobs:
                logger.debug("No pending jobs in queue")
                break
            
            for job in jobs:
                self.upload_queue.increment_attempts(job.id)
                self._process_upload_job(job.id)
                time.sleep(1)  # Small delay between jobs
    
    def get_health_status(self) -> Dict[str, Any]:
        """Get health status of uploader"""
        try:
            response = self.session.get(f"{self.base_url}/api/ingestion/health", timeout=5)
            api_healthy = response.status_code == 200
        except:
            api_healthy = False
        
        return {
            'circuit_breaker_state': self.circuit_breaker.state.value,
            'api_endpoint_healthy': api_healthy,
            'queue_size': len(self.upload_queue.get_next_jobs(limit=1000)),
            'timestamp': datetime.now().isoformat()
        }


def main():
    """Main entry point for testing"""
    import argparse
    
    parser = argparse.ArgumentParser(description='TenderFlow Cloud Uploader')
    parser.add_argument('--url', default='http://localhost:3457', help='API base URL')
    parser.add_argument('--api-key', help='API key for authentication')
    parser.add_argument('--scraper-id', default='local-scraper', help='Scraper ID')
    parser.add_argument('--file', help='File to upload')
    parser.add_argument('--process-queue', action='store_true', help='Process pending queue')
    parser.add_argument('--health', action='store_true', help='Check health status')
    
    args = parser.parse_args()
    
    uploader = CloudUploader(args.url, args.api_key, args.scraper_id)
    
    if args.health:
        health = uploader.get_health_status()
        print(json.dumps(health, indent=2))
    elif args.process_queue:
        logger.info("Processing upload queue...")
        uploader.process_queue()
    elif args.file:
        success, error = uploader.upload_file(args.file)
        if success:
            logger.info(f"Successfully uploaded {args.file}")
        else:
            logger.error(f"Failed to upload {args.file}: {error}")
    else:
        parser.print_help()


if __name__ == '__main__':
    main()