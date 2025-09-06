"""
Monitoring Module for TenderFlow Local Scraper
Provides OpenTelemetry-based metrics collection and export to GCP
"""

import os
import time
import psutil
import logging
import threading
from typing import Dict, Any, Optional, Callable
from datetime import datetime
from contextlib import contextmanager
from functools import wraps
import json
import hashlib

# OpenTelemetry imports
from opentelemetry import metrics, trace
from opentelemetry.exporter.cloud_monitoring import CloudMonitoringMetricsExporter
from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.trace import Status, StatusCode
from opentelemetry.propagate import set_global_textmap, get_global_textmap

# Configure logging
logger = logging.getLogger(__name__)


class ScraperMonitor:
    """Comprehensive monitoring for local scraper operations"""
    
    def __init__(self, project_id: str = None, scraper_id: str = None):
        self.project_id = project_id or os.environ.get('GCP_PROJECT_ID')
        self.scraper_id = scraper_id or os.environ.get('TENDERFLOW_SCRAPER_ID', 'local-scraper')
        self.metrics = {}
        self.traces = {}
        
        # Initialize resource attributes
        resource = Resource.create({
            "service.name": "tenderflow-scraper",
            "service.version": "1.0.0",
            "scraper.id": self.scraper_id,
            "deployment.environment": os.environ.get('ENVIRONMENT', 'local')
        })
        
        # Initialize metrics
        if self.project_id:
            self._init_metrics(resource)
        else:
            logger.warning("No GCP project ID provided, metrics will be logged locally only")
            self._init_local_metrics(resource)
        
        # Initialize tracing
        if self.project_id:
            self._init_tracing(resource)
        else:
            self._init_local_tracing(resource)
        
        # Instrument HTTP requests
        RequestsInstrumentor().instrument()
        
        # Start background health collector
        self._start_health_collector()
    
    def _init_metrics(self, resource: Resource):
        """Initialize GCP Cloud Monitoring metrics"""
        try:
            # Create metrics exporter
            exporter = CloudMonitoringMetricsExporter(
                project_id=self.project_id,
                resource=resource
            )
            
            # Create metric reader with 60-second interval
            reader = PeriodicExportingMetricReader(
                exporter=exporter,
                export_interval_millis=60000
            )
            
            # Set up meter provider
            provider = MeterProvider(
                resource=resource,
                metric_readers=[reader]
            )
            metrics.set_meter_provider(provider)
            
            # Get meter instance
            self.meter = metrics.get_meter("tenderflow.scraper")
            self._create_metrics()
            
            logger.info(f"Initialized GCP metrics export for project {self.project_id}")
            
        except Exception as e:
            logger.error(f"Failed to initialize GCP metrics: {e}")
            self._init_local_metrics(resource)
    
    def _init_local_metrics(self, resource: Resource):
        """Initialize local metrics collection (fallback)"""
        provider = MeterProvider(resource=resource)
        metrics.set_meter_provider(provider)
        self.meter = metrics.get_meter("tenderflow.scraper")
        self._create_metrics()
        logger.info("Using local metrics collection")
    
    def _create_metrics(self):
        """Create metric instruments"""
        # Counters
        self.metrics['scraped_tenders'] = self.meter.create_counter(
            name="scraper.tenders.scraped",
            description="Total number of tenders scraped",
            unit="1"
        )
        
        self.metrics['upload_success'] = self.meter.create_counter(
            name="scraper.uploads.success",
            description="Successful uploads to cloud",
            unit="1"
        )
        
        self.metrics['upload_failures'] = self.meter.create_counter(
            name="scraper.uploads.failed",
            description="Failed uploads to cloud",
            unit="1"
        )
        
        self.metrics['validation_errors'] = self.meter.create_counter(
            name="scraper.validation.errors",
            description="Data validation errors",
            unit="1"
        )
        
        # Histograms
        self.metrics['scrape_duration'] = self.meter.create_histogram(
            name="scraper.operation.duration",
            description="Time taken to scrape a page",
            unit="ms"
        )
        
        self.metrics['upload_duration'] = self.meter.create_histogram(
            name="scraper.upload.duration",
            description="Time taken to upload data",
            unit="ms"
        )
        
        # Gauges (via Observable callbacks)
        self.metrics['queue_depth'] = self.meter.create_observable_gauge(
            name="scraper.queue.depth",
            callbacks=[self._get_queue_depth],
            description="Current queue depth",
            unit="1"
        )
        
        self.metrics['cpu_usage'] = self.meter.create_observable_gauge(
            name="scraper.resource.cpu",
            callbacks=[self._get_cpu_usage],
            description="CPU usage percentage",
            unit="%"
        )
        
        self.metrics['memory_usage'] = self.meter.create_observable_gauge(
            name="scraper.resource.memory",
            callbacks=[self._get_memory_usage],
            description="Memory usage in MB",
            unit="MB"
        )
        
        self.metrics['circuit_breaker_state'] = self.meter.create_observable_gauge(
            name="scraper.circuit_breaker.state",
            callbacks=[self._get_circuit_state],
            description="Circuit breaker state (0=closed, 1=open, 2=half-open)",
            unit="1"
        )
    
    def _init_tracing(self, resource: Resource):
        """Initialize GCP Cloud Trace"""
        try:
            exporter = CloudTraceSpanExporter(project_id=self.project_id)
            
            provider = TracerProvider(resource=resource)
            processor = BatchSpanProcessor(exporter)
            provider.add_span_processor(processor)
            
            trace.set_tracer_provider(provider)
            self.tracer = trace.get_tracer("tenderflow.scraper")
            
            logger.info(f"Initialized GCP tracing for project {self.project_id}")
            
        except Exception as e:
            logger.error(f"Failed to initialize GCP tracing: {e}")
            self._init_local_tracing(resource)
    
    def _init_local_tracing(self, resource: Resource):
        """Initialize local tracing (fallback)"""
        provider = TracerProvider(resource=resource)
        trace.set_tracer_provider(provider)
        self.tracer = trace.get_tracer("tenderflow.scraper")
        logger.info("Using local tracing")
    
    def _start_health_collector(self):
        """Start background thread for health metrics"""
        def collect_health():
            while True:
                try:
                    # Collect system metrics every 30 seconds
                    time.sleep(30)
                    # Metrics are collected via observable callbacks
                except Exception as e:
                    logger.error(f"Health collector error: {e}")
        
        thread = threading.Thread(target=collect_health, daemon=True)
        thread.start()
    
    # Observable metric callbacks
    def _get_queue_depth(self, options):
        """Get current queue depth"""
        try:
            # Import here to avoid circular dependency
            from upload_queue import UploadQueue
            queue = UploadQueue()
            depth = len(queue.get_next_jobs(limit=10000))
            yield metrics.Observation(depth, {"scraper_id": self.scraper_id})
        except:
            yield metrics.Observation(0, {"scraper_id": self.scraper_id})
    
    def _get_cpu_usage(self, options):
        """Get CPU usage percentage"""
        cpu_percent = psutil.cpu_percent(interval=1)
        yield metrics.Observation(cpu_percent, {"scraper_id": self.scraper_id})
    
    def _get_memory_usage(self, options):
        """Get memory usage in MB"""
        memory = psutil.Process().memory_info()
        memory_mb = memory.rss / 1024 / 1024
        yield metrics.Observation(memory_mb, {"scraper_id": self.scraper_id})
    
    def _get_circuit_state(self, options):
        """Get circuit breaker state"""
        try:
            # Import here to avoid circular dependency
            from cloud_uploader import CircuitState
            # This would need access to the actual circuit breaker instance
            # For now, return closed state
            yield metrics.Observation(0, {"scraper_id": self.scraper_id})
        except:
            yield metrics.Observation(0, {"scraper_id": self.scraper_id})
    
    # Metric recording methods
    def record_scrape_success(self, portal: str, tenders_count: int):
        """Record successful scrape operation"""
        attributes = {
            "scraper_id": self.scraper_id,
            "portal": portal,
            "status": "success"
        }
        self.metrics['scraped_tenders'].add(tenders_count, attributes)
    
    def record_scrape_failure(self, portal: str, error: str):
        """Record failed scrape operation"""
        attributes = {
            "scraper_id": self.scraper_id,
            "portal": portal,
            "status": "failed",
            "error_type": type(error).__name__ if hasattr(error, '__name__') else str(error)[:50]
        }
        self.metrics['validation_errors'].add(1, attributes)
    
    def record_upload_success(self, batch_id: str, tenders_count: int, duration_ms: float):
        """Record successful upload"""
        attributes = {
            "scraper_id": self.scraper_id,
            "batch_id": batch_id
        }
        self.metrics['upload_success'].add(1, attributes)
        self.metrics['upload_duration'].record(duration_ms, attributes)
    
    def record_upload_failure(self, batch_id: str, error: str):
        """Record failed upload"""
        attributes = {
            "scraper_id": self.scraper_id,
            "batch_id": batch_id,
            "error_type": type(error).__name__ if hasattr(error, '__name__') else str(error)[:50]
        }
        self.metrics['upload_failures'].add(1, attributes)
    
    # Tracing decorators and context managers
    @contextmanager
    def trace_operation(self, operation_name: str, attributes: Dict[str, Any] = None):
        """Context manager for tracing operations"""
        span = self.tracer.start_span(operation_name)
        
        if attributes:
            span.set_attributes(attributes)
        
        try:
            yield span
            span.set_status(Status(StatusCode.OK))
        except Exception as e:
            span.set_status(Status(StatusCode.ERROR, str(e)))
            span.record_exception(e)
            raise
        finally:
            span.end()
    
    def trace_scrape(self, portal: str):
        """Decorator for tracing scrape operations"""
        def decorator(func: Callable):
            @wraps(func)
            def wrapper(*args, **kwargs):
                with self.trace_operation(
                    "scrape_portal",
                    {"portal": portal, "scraper_id": self.scraper_id}
                ) as span:
                    start_time = time.time()
                    try:
                        result = func(*args, **kwargs)
                        duration_ms = (time.time() - start_time) * 1000
                        self.metrics['scrape_duration'].record(
                            duration_ms,
                            {"portal": portal, "scraper_id": self.scraper_id}
                        )
                        span.set_attribute("tenders_count", len(result) if result else 0)
                        return result
                    except Exception as e:
                        self.record_scrape_failure(portal, str(e))
                        raise
            return wrapper
        return decorator
    
    def trace_upload(self, func: Callable):
        """Decorator for tracing upload operations"""
        @wraps(func)
        def wrapper(*args, **kwargs):
            batch_id = kwargs.get('batch_id', 'unknown')
            with self.trace_operation(
                "upload_batch",
                {"batch_id": batch_id, "scraper_id": self.scraper_id}
            ) as span:
                start_time = time.time()
                try:
                    result = func(*args, **kwargs)
                    duration_ms = (time.time() - start_time) * 1000
                    if result[0]:  # Success
                        self.record_upload_success(batch_id, 1, duration_ms)
                    else:
                        self.record_upload_failure(batch_id, result[1])
                    return result
                except Exception as e:
                    self.record_upload_failure(batch_id, str(e))
                    raise
        return wrapper
    
    def get_correlation_id(self) -> str:
        """Generate correlation ID for end-to-end tracing"""
        timestamp = datetime.now().isoformat()
        data = f"{self.scraper_id}-{timestamp}"
        return hashlib.sha256(data.encode()).hexdigest()[:16]
    
    def export_metrics_snapshot(self) -> Dict[str, Any]:
        """Export current metrics snapshot for local debugging"""
        return {
            "timestamp": datetime.now().isoformat(),
            "scraper_id": self.scraper_id,
            "system": {
                "cpu_percent": psutil.cpu_percent(interval=1),
                "memory_mb": psutil.Process().memory_info().rss / 1024 / 1024,
                "disk_usage_percent": psutil.disk_usage('/').percent
            },
            "network": {
                "bytes_sent": psutil.net_io_counters().bytes_sent,
                "bytes_recv": psutil.net_io_counters().bytes_recv
            }
        }


class HealthCheck:
    """Health check endpoint for local scraper"""
    
    def __init__(self, monitor: ScraperMonitor):
        self.monitor = monitor
        
    def get_health_status(self) -> Dict[str, Any]:
        """Get comprehensive health status"""
        try:
            metrics_snapshot = self.monitor.export_metrics_snapshot()
            
            # Determine overall health
            cpu_healthy = metrics_snapshot['system']['cpu_percent'] < 80
            memory_healthy = metrics_snapshot['system']['memory_mb'] < 2048
            disk_healthy = metrics_snapshot['system']['disk_usage_percent'] < 90
            
            overall_healthy = all([cpu_healthy, memory_healthy, disk_healthy])
            
            return {
                "status": "healthy" if overall_healthy else "degraded",
                "timestamp": datetime.now().isoformat(),
                "scraper_id": self.monitor.scraper_id,
                "checks": {
                    "cpu": {"healthy": cpu_healthy, "value": metrics_snapshot['system']['cpu_percent']},
                    "memory": {"healthy": memory_healthy, "value": metrics_snapshot['system']['memory_mb']},
                    "disk": {"healthy": disk_healthy, "value": metrics_snapshot['system']['disk_usage_percent']}
                },
                "metrics": metrics_snapshot
            }
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return {
                "status": "unhealthy",
                "timestamp": datetime.now().isoformat(),
                "error": str(e)
            }


# Global monitor instance
_monitor: Optional[ScraperMonitor] = None


def initialize_monitoring(project_id: str = None, scraper_id: str = None) -> ScraperMonitor:
    """Initialize global monitoring instance"""
    global _monitor
    if _monitor is None:
        _monitor = ScraperMonitor(project_id, scraper_id)
    return _monitor


def get_monitor() -> ScraperMonitor:
    """Get global monitoring instance"""
    global _monitor
    if _monitor is None:
        _monitor = initialize_monitoring()
    return _monitor


# Example usage
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Scraper Monitoring Module")
    parser.add_argument("--project-id", help="GCP Project ID")
    parser.add_argument("--scraper-id", default="local-scraper", help="Scraper ID")
    parser.add_argument("--health", action="store_true", help="Run health check")
    
    args = parser.parse_args()
    
    monitor = initialize_monitoring(args.project_id, args.scraper_id)
    
    if args.health:
        health = HealthCheck(monitor)
        status = health.get_health_status()
        print(json.dumps(status, indent=2))
    else:
        print("Monitoring initialized. Metrics will be exported to GCP.")
        print(f"Project ID: {args.project_id or 'Local only'}")
        print(f"Scraper ID: {monitor.scraper_id}")
        
        # Keep running for demo
        try:
            while True:
                time.sleep(60)
                snapshot = monitor.export_metrics_snapshot()
                print(f"Metrics snapshot: {json.dumps(snapshot, indent=2)}")
        except KeyboardInterrupt:
            print("\nShutting down monitoring...")