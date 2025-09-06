"""
Configuration file for the sekerap tender scraper.

This module contains all configuration settings for scraping zakup.sk.kz portal,
including URLs, pagination, database settings, and API configurations.
"""

import os
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
from pathlib import Path

# =============================================================================
# BASE URLS AND ENDPOINTS
# =============================================================================

# Main tender portal URL
TENDER_URL: str = "https://zakup.sk.kz/#/ext(popup:search)?tabs=tenders&adst=PUBLISHED&lst=PUBLISHED"

# Paginated tender URL template - use .format(page=N) to insert page number
TENDER_PAGE_URL: str = "https://zakup.sk.kz/#/ext(popup:search)?tabs=tenders&adst=PUBLISHED&lst=PUBLISHED&page={page}"

# API endpoints for additional data (if needed)
TENDER_DETAIL_API: str = "https://zakup.sk.kz/api/tenders/{tender_id}"
TENDER_SEARCH_API: str = "https://zakup.sk.kz/api/search"

# =============================================================================
# PAGINATION SETTINGS
# =============================================================================

# Number of tenders displayed per page on zakup.sk.kz
TENDERS_PER_PAGE: int = 20

# Maximum number of pages to scrape (0 = unlimited)
MAX_PAGES: int = 0

# Starting page number
START_PAGE: int = 1

# =============================================================================
# CSV AND JSON FIELD DEFINITIONS
# =============================================================================

# CSV field names for tender data export
CSV_FIELDS: List[str] = [
    "id",           # Tender ID/number
    "title",        # Tender title/description
    "status",       # Current tender status
    "days_left",    # Days remaining before closing
    "value",        # Tender value in KZT
    "url"           # Direct URL to tender details
]

# Extended fields for JSON export (includes additional metadata)
JSON_FIELDS: List[str] = CSV_FIELDS + [
    "scraped_at",       # Timestamp when data was scraped
    "page_number",      # Source page number
    "category",         # Tender category (if available)
    "buyer_name",       # Name of the buying organization
    "publication_date", # Date when tender was published
    "deadline_date",    # Submission deadline
    "location",         # Geographic location/region
    "requirements"      # Brief requirements description
]

# Field mappings for data transformation
FIELD_MAPPINGS: Dict[str, str] = {
    "tender_id": "id",
    "tender_title": "title",
    "tender_status": "status",
    "remaining_days": "days_left",
    "tender_value": "value",
    "tender_url": "url"
}

# =============================================================================
# SCRAPING CONFIGURATION
# =============================================================================

@dataclass
class ScrapingConfig:
    """Configuration class for scraping behavior."""
    
    # Timing settings (in seconds)
    page_load_timeout: int = 15
    element_wait_timeout: int = 10
    retry_delay: float = 2.0
    max_retry_delay: float = 16.0
    
    # Worker settings
    max_workers: int = 4
    default_workers: Optional[int] = None  # Uses CPU count if None
    
    # Browser settings
    headless_mode: bool = True
    disable_images: bool = True
    disable_javascript: bool = False
    user_agent: str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    
    # Error handling
    max_retries: int = 5
    continue_on_error: bool = True
    
    # Rate limiting
    request_delay_min: float = 0.5
    request_delay_max: float = 2.0
    requests_per_minute: int = 30

# Default scraping configuration
SCRAPING_CONFIG = ScrapingConfig()

# =============================================================================
# DATABASE CONNECTION SETTINGS
# =============================================================================

@dataclass
class DatabaseConfig:
    """Database connection configuration."""
    
    # PostgreSQL settings
    postgres_host: str = os.getenv("POSTGRES_HOST", "localhost")
    postgres_port: int = int(os.getenv("POSTGRES_PORT", "5432"))
    postgres_db: str = os.getenv("POSTGRES_DB", "tender_db")
    postgres_user: str = os.getenv("POSTGRES_USER", "tender_user")
    postgres_password: str = os.getenv("POSTGRES_PASSWORD", "")
    
    # SQLite fallback
    sqlite_path: str = os.getenv("SQLITE_PATH", "tenders.db")
    
    # Connection pool settings
    pool_size: int = 5
    max_overflow: int = 10
    pool_timeout: int = 30
    
    @property
    def postgres_url(self) -> str:
        """Generate PostgreSQL connection URL."""
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )
    
    @property
    def sqlite_url(self) -> str:
        """Generate SQLite connection URL."""
        return f"sqlite:///{self.sqlite_path}"

# Default database configuration
DATABASE_CONFIG = DatabaseConfig()

# =============================================================================
# API KEYS AND AUTHENTICATION
# =============================================================================

@dataclass
class APIConfig:
    """API keys and authentication settings."""
    
    # Translation API (Google Translate, DeepL, etc.)
    google_translate_api_key: str = os.getenv("GOOGLE_TRANSLATE_API_KEY", "")
    deepl_api_key: str = os.getenv("DEEPL_API_KEY", "")
    
    # Notification services
    slack_webhook_url: str = os.getenv("SLACK_WEBHOOK_URL", "")
    discord_webhook_url: str = os.getenv("DISCORD_WEBHOOK_URL", "")
    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    telegram_chat_id: str = os.getenv("TELEGRAM_CHAT_ID", "")
    
    # Email settings
    smtp_server: str = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_username: str = os.getenv("SMTP_USERNAME", "")
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")
    
    # Analytics and monitoring
    sentry_dsn: str = os.getenv("SENTRY_DSN", "")
    datadog_api_key: str = os.getenv("DATADOG_API_KEY", "")

# Default API configuration
API_CONFIG = APIConfig()

# =============================================================================
# NOTIFICATION SETTINGS
# =============================================================================

@dataclass
class NotificationConfig:
    """Notification and alerting configuration."""
    
    # When to send notifications
    notify_on_completion: bool = True
    notify_on_error: bool = True
    notify_on_large_batch: bool = True
    large_batch_threshold: int = 1000
    
    # Notification channels
    email_enabled: bool = bool(API_CONFIG.smtp_username)
    slack_enabled: bool = bool(API_CONFIG.slack_webhook_url)
    telegram_enabled: bool = bool(API_CONFIG.telegram_bot_token)
    
    # Email settings
    email_recipients: List[str] = field(default_factory=list)
    email_subject_prefix: str = "[Tender Scraper]"
    
    # Message templates
    completion_message: str = "✅ Scraping completed: {count} tenders processed"
    error_message: str = "❌ Scraping error: {error}"
    large_batch_message: str = "📊 Large batch detected: {count} tenders found"

# Default notification configuration
NOTIFICATION_CONFIG = NotificationConfig()

# =============================================================================
# FILE PATHS AND OUTPUT SETTINGS
# =============================================================================

# Base directory for output files
OUTPUT_DIR: Path = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

# File naming patterns
CSV_FILENAME_PATTERN: str = "tender_data_{timestamp}.csv"
JSON_FILENAME_PATTERN: str = "tender_data_{timestamp}.json"
LOG_FILENAME_PATTERN: str = "scraper_{timestamp}.log"

# Archive settings
ARCHIVE_DIR: Path = OUTPUT_DIR / "archive"
ARCHIVE_DIR.mkdir(exist_ok=True)
KEEP_FILES_DAYS: int = 30

# =============================================================================
# FILTERING AND VALIDATION SETTINGS
# =============================================================================

@dataclass
class FilterConfig:
    """Data filtering and validation configuration."""
    
    # Value filters
    min_tender_value: float = 0.0
    max_tender_value: float = float('inf')
    
    # Time filters
    max_days_left: Optional[int] = None
    min_days_left: Optional[int] = None
    
    # Status filters
    allowed_statuses: List[str] = field(default_factory=lambda: ["PUBLISHED", "ACTIVE", "OPEN"])
    excluded_statuses: List[str] = field(default_factory=lambda: ["CANCELLED", "CLOSED", "EXPIRED"])
    
    # Content filters
    required_keywords: List[str] = field(default_factory=list)
    excluded_keywords: List[str] = field(default_factory=list)
    
    # Validation rules
    require_valid_id: bool = True
    require_valid_title: bool = True
    require_valid_value: bool = False
    
    # Duplicate handling
    remove_duplicates: bool = True
    duplicate_check_fields: List[str] = field(default_factory=lambda: ["id", "title"])

# Default filter configuration
FILTER_CONFIG = FilterConfig()

# =============================================================================
# LOGGING CONFIGURATION
# =============================================================================

LOGGING_CONFIG: Dict[str, Any] = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S"
        },
        "detailed": {
            "format": "%(asctime)s | %(levelname)s | %(name)s:%(lineno)d | %(funcName)s | %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S"
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "level": "INFO",
            "formatter": "standard",
            "stream": "ext://sys.stdout"
        },
        "file": {
            "class": "logging.handlers.RotatingFileHandler",
            "level": "DEBUG",
            "formatter": "detailed",
            "filename": "scraper.log",
            "maxBytes": 10485760,  # 10MB
            "backupCount": 5
        }
    },
    "loggers": {
        "": {
            "handlers": ["console", "file"],
            "level": "DEBUG",
            "propagate": False
        },
        "selenium": {
            "level": "WARNING"
        },
        "urllib3": {
            "level": "WARNING"
        }
    }
}

# =============================================================================
# ENVIRONMENT-SPECIFIC OVERRIDES
# =============================================================================

# Load environment-specific settings
ENV = os.getenv("ENVIRONMENT", "development").lower()

if ENV == "production":
    SCRAPING_CONFIG.headless_mode = True
    SCRAPING_CONFIG.max_workers = 2
    NOTIFICATION_CONFIG.notify_on_completion = True
    NOTIFICATION_CONFIG.notify_on_error = True
elif ENV == "development":
    SCRAPING_CONFIG.headless_mode = False
    SCRAPING_CONFIG.max_workers = 1
    NOTIFICATION_CONFIG.notify_on_completion = False
elif ENV == "testing":
    SCRAPING_CONFIG.headless_mode = True
    SCRAPING_CONFIG.max_workers = 1
    MAX_PAGES = 2  # Limit pages during testing
    NOTIFICATION_CONFIG.notify_on_completion = False
    NOTIFICATION_CONFIG.notify_on_error = False

# =============================================================================
# CONFIGURATION VALIDATION
# =============================================================================

def validate_config() -> bool:
    """
    Validate configuration settings and environment variables.
    
    Returns:
        bool: True if configuration is valid, False otherwise
    """
    errors = []
    
    # Check required URLs
    if not TENDER_URL:
        errors.append("TENDER_URL is required")
    
    if not TENDER_PAGE_URL or "{page}" not in TENDER_PAGE_URL:
        errors.append("TENDER_PAGE_URL must contain {page} placeholder")
    
    # Check pagination settings
    if TENDERS_PER_PAGE <= 0:
        errors.append("TENDERS_PER_PAGE must be positive")
    
    # Check worker settings
    if SCRAPING_CONFIG.max_workers <= 0:
        errors.append("max_workers must be positive")
    
    # Check database config in production
    if ENV == "production" and not DATABASE_CONFIG.postgres_password:
        errors.append("POSTGRES_PASSWORD is required in production")
    
    # Check notification config
    if NOTIFICATION_CONFIG.email_enabled and not API_CONFIG.smtp_password:
        errors.append("SMTP_PASSWORD is required when email notifications are enabled")
    
    if errors:
        for error in errors:
            print(f"❌ Configuration error: {error}")
        return False
    
    return True

# =============================================================================
# CONFIGURATION EXPORT
# =============================================================================

def get_config_summary() -> Dict[str, Any]:
    """
    Get a summary of current configuration settings.
    
    Returns:
        Dict containing configuration summary
    """
    return {
        "environment": ENV,
        "base_url": TENDER_URL,
        "pagination": {
            "tenders_per_page": TENDERS_PER_PAGE,
            "max_pages": MAX_PAGES,
            "start_page": START_PAGE
        },
        "scraping": {
            "headless_mode": SCRAPING_CONFIG.headless_mode,
            "max_workers": SCRAPING_CONFIG.max_workers,
            "max_retries": SCRAPING_CONFIG.max_retries
        },
        "database": {
            "type": "postgresql" if DATABASE_CONFIG.postgres_password else "sqlite",
            "host": DATABASE_CONFIG.postgres_host if DATABASE_CONFIG.postgres_password else "local"
        },
        "notifications": {
            "email_enabled": NOTIFICATION_CONFIG.email_enabled,
            "slack_enabled": NOTIFICATION_CONFIG.slack_enabled,
            "telegram_enabled": NOTIFICATION_CONFIG.telegram_enabled
        }
    }

# Validate configuration on import
if __name__ == "__main__":
    is_valid = validate_config()
    if is_valid:
        print("✅ Configuration is valid")
        import json
        print(json.dumps(get_config_summary(), indent=2))
    else:
        print("❌ Configuration validation failed")
        exit(1)