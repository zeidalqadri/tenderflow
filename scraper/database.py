"""
Database integration layer for the Kazakhstan Tender System scraper.

This module provides database operations for storing and retrieving
tender data, managing scraping logs, and handling notifications.
"""

import os
import sys
import logging
import hashlib
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from psycopg2.pool import SimpleConnectionPool
from psycopg2 import sql

from config import DATABASE_CONFIG

# Setup logging
logger = logging.getLogger(__name__)

@dataclass
class TenderData:
    """Data class for tender information."""
    id: str
    title: str
    status: str
    url: str
    value: Optional[str] = None
    value_numeric: Optional[float] = None
    days_left: Optional[str] = None
    days_left_numeric: Optional[int] = None
    buyer_name: Optional[str] = None
    location: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    publication_date: Optional[datetime] = None
    deadline_date: Optional[datetime] = None
    source_page: Optional[int] = None
    title_en: Optional[str] = None
    status_en: Optional[str] = None
    buyer_name_en: Optional[str] = None
    location_en: Optional[str] = None
    category_en: Optional[str] = None
    description_en: Optional[str] = None
    requirements: Optional[str] = None
    requirements_en: Optional[str] = None

@dataclass
class ScrapingSession:
    """Data class for scraping session information."""
    session_id: str
    started_at: datetime
    pages_scraped: int = 0
    pages_total: int = 0
    tenders_found: int = 0
    tenders_new: int = 0
    tenders_updated: int = 0
    tenders_skipped: int = 0
    errors_count: int = 0
    warnings_count: int = 0
    status: str = 'running'
    error_message: Optional[str] = None
    completed_at: Optional[datetime] = None

class DatabaseManager:
    """Database manager for tender system operations."""
    
    def __init__(self, config=None):
        """Initialize database manager."""
        self.config = config or DATABASE_CONFIG
        self._connection_pool = None
        
        # Validate configuration
        if not self.config.postgres_password:
            logger.warning("No PostgreSQL password configured. Using SQLite fallback.")
            self.use_postgres = False
        else:
            self.use_postgres = True
    
    def _create_connection_pool(self):
        """Create database connection pool."""
        if not self.use_postgres:
            logger.warning("Connection pooling not available with SQLite")
            return None
        
        try:
            self._connection_pool = SimpleConnectionPool(
                1, self.config.pool_size,
                host=self.config.postgres_host,
                port=self.config.postgres_port,
                database=self.config.postgres_db,
                user=self.config.postgres_user,
                password=self.config.postgres_password
            )
            logger.info("✅ Database connection pool created")
            return self._connection_pool
        except Exception as e:
            logger.error(f"❌ Failed to create connection pool: {e}")
            return None
    
    @contextmanager
    def get_connection(self):
        """Get database connection context manager."""
        connection = None
        try:
            if self.use_postgres:
                if not self._connection_pool:
                    self._create_connection_pool()
                
                if self._connection_pool:
                    connection = self._connection_pool.getconn()
                else:
                    # Fallback to direct connection
                    connection = psycopg2.connect(self.config.postgres_url)
            else:
                # SQLite fallback (for development/testing)
                import sqlite3
                connection = sqlite3.connect(self.config.sqlite_path)
            
            yield connection
            
        except Exception as e:
            if connection:
                connection.rollback()
            logger.error(f"Database connection error: {e}")
            raise
        finally:
            if connection:
                if self.use_postgres and self._connection_pool:
                    self._connection_pool.putconn(connection)
                else:
                    connection.close()
    
    def test_connection(self) -> bool:
        """Test database connectivity."""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT 1")
                result = cursor.fetchone()
                cursor.close()
                return result is not None
        except Exception as e:
            logger.error(f"Database connection test failed: {e}")
            return False
    
    def create_scraping_session(self, session_id: str, pages_total: int = 0) -> bool:
        """Create a new scraping session record."""
        try:
            session = ScrapingSession(
                session_id=session_id,
                started_at=datetime.now(),
                pages_total=pages_total
            )
            
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO scraping_logs 
                    (session_id, started_at, pages_total, status)
                    VALUES (%s, %s, %s, %s)
                """, (session.session_id, session.started_at, session.pages_total, session.status))
                
                conn.commit()
                cursor.close()
                
            logger.info(f"✅ Created scraping session: {session_id}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to create scraping session: {e}")
            return False
    
    def update_scraping_session(self, session_id: str, **kwargs) -> bool:
        """Update scraping session with new data."""
        try:
            # Build dynamic update query
            update_fields = []
            values = []
            
            for field, value in kwargs.items():
                if field in ['pages_scraped', 'tenders_found', 'tenders_new', 'tenders_updated', 
                           'tenders_skipped', 'errors_count', 'warnings_count', 'status', 
                           'error_message', 'completed_at']:
                    update_fields.append(f"{field} = %s")
                    values.append(value)
            
            if not update_fields:
                return True  # Nothing to update
            
            values.append(session_id)  # For WHERE clause
            
            with self.get_connection() as conn:
                cursor = conn.cursor()
                query = f"""
                    UPDATE scraping_logs 
                    SET {', '.join(update_fields)}
                    WHERE session_id = %s
                """
                cursor.execute(query, values)
                conn.commit()
                cursor.close()
                
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to update scraping session: {e}")
            return False
    
    def complete_scraping_session(self, session_id: str, status: str = 'completed') -> bool:
        """Mark scraping session as completed."""
        return self.update_scraping_session(
            session_id,
            status=status,
            completed_at=datetime.now()
        )
    
    def save_tender(self, tender: TenderData) -> Tuple[bool, str]:
        """
        Save tender data to database.
        
        Returns:
            Tuple of (success, operation) where operation is 'inserted', 'updated', or 'skipped'
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                # Check if tender already exists
                cursor.execute("SELECT hash_checksum, version FROM tenders WHERE id = %s", (tender.id,))
                existing = cursor.fetchone()
                
                # Calculate new hash
                new_hash = self._calculate_tender_hash(tender)
                
                if existing:
                    existing_hash, version = existing
                    if existing_hash == new_hash:
                        cursor.close()
                        return True, 'skipped'  # No changes
                    else:
                        # Update existing tender
                        operation = self._update_tender(cursor, tender, version + 1)
                else:
                    # Insert new tender
                    operation = self._insert_tender(cursor, tender)
                
                conn.commit()
                cursor.close()
                
                return True, operation
                
        except Exception as e:
            logger.error(f"❌ Failed to save tender {tender.id}: {e}")
            return False, 'error'
    
    def _insert_tender(self, cursor, tender: TenderData) -> str:
        """Insert new tender into database."""
        cursor.execute("""
            INSERT INTO tenders (
                id, title, title_en, status, status_en, url, value, value_numeric,
                days_left, days_left_numeric, buyer_name, buyer_name_en, location, location_en,
                category, category_en, description, description_en, requirements, requirements_en,
                publication_date, deadline_date, source_page, scraped_at
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
        """, (
            tender.id, tender.title, tender.title_en, tender.status, tender.status_en,
            tender.url, tender.value, tender.value_numeric, tender.days_left, tender.days_left_numeric,
            tender.buyer_name, tender.buyer_name_en, tender.location, tender.location_en,
            tender.category, tender.category_en, tender.description, tender.description_en,
            tender.requirements, tender.requirements_en, tender.publication_date, tender.deadline_date,
            tender.source_page, datetime.now()
        ))
        return 'inserted'
    
    def _update_tender(self, cursor, tender: TenderData, new_version: int) -> str:
        """Update existing tender in database."""
        cursor.execute("""
            UPDATE tenders SET
                title = %s, title_en = %s, status = %s, status_en = %s, value = %s, value_numeric = %s,
                days_left = %s, days_left_numeric = %s, buyer_name = %s, buyer_name_en = %s,
                location = %s, location_en = %s, category = %s, category_en = %s,
                description = %s, description_en = %s, requirements = %s, requirements_en = %s,
                publication_date = %s, deadline_date = %s, source_page = %s, version = %s,
                updated_at = %s
            WHERE id = %s
        """, (
            tender.title, tender.title_en, tender.status, tender.status_en,
            tender.value, tender.value_numeric, tender.days_left, tender.days_left_numeric,
            tender.buyer_name, tender.buyer_name_en, tender.location, tender.location_en,
            tender.category, tender.category_en, tender.description, tender.description_en,
            tender.requirements, tender.requirements_en, tender.publication_date, tender.deadline_date,
            tender.source_page, new_version, datetime.now(), tender.id
        ))
        return 'updated'
    
    def _calculate_tender_hash(self, tender: TenderData) -> str:
        """Calculate hash for tender data to detect changes."""
        hash_data = f"{tender.title}{tender.status}{tender.value}{tender.days_left}{tender.buyer_name}"
        return hashlib.sha256(hash_data.encode()).hexdigest()
    
    def get_tender_by_id(self, tender_id: str) -> Optional[Dict[str, Any]]:
        """Get tender by ID."""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
                cursor.execute("SELECT * FROM tenders WHERE id = %s", (tender_id,))
                result = cursor.fetchone()
                cursor.close()
                
                return dict(result) if result else None
                
        except Exception as e:
            logger.error(f"❌ Failed to get tender {tender_id}: {e}")
            return None
    
    def get_tenders_for_notification(self, urgency_levels: List[str] = None) -> List[Dict[str, Any]]:
        """Get tenders that need notification."""
        if not urgency_levels:
            urgency_levels = ['high', 'critical']
        
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
                
                placeholders = ','.join(['%s'] * len(urgency_levels))
                cursor.execute(f"""
                    SELECT * FROM tenders 
                    WHERE notified = FALSE 
                        AND archived = FALSE 
                        AND urgency IN ({placeholders})
                        AND (days_left_numeric IS NULL OR days_left_numeric > 0)
                    ORDER BY urgency DESC, value_numeric DESC
                """, urgency_levels)
                
                results = cursor.fetchall()
                cursor.close()
                
                return [dict(row) for row in results]
                
        except Exception as e:
            logger.error(f"❌ Failed to get tenders for notification: {e}")
            return []
    
    def mark_tender_notified(self, tender_id: str) -> bool:
        """Mark tender as notified."""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "UPDATE tenders SET notified = TRUE WHERE id = %s",
                    (tender_id,)
                )
                conn.commit()
                cursor.close()
                return True
                
        except Exception as e:
            logger.error(f"❌ Failed to mark tender {tender_id} as notified: {e}")
            return False
    
    def record_notification(self, tender_id: str, notification_type: str, 
                          channel: str, recipient: str, success: bool = True,
                          error_message: str = None) -> bool:
        """Record notification attempt."""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO notifications 
                    (tender_id, notification_type, channel, recipient, success, error_message)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (tender_id, notification_type, channel, recipient, success, error_message))
                
                conn.commit()
                cursor.close()
                return True
                
        except Exception as e:
            logger.error(f"❌ Failed to record notification: {e}")
            return False
    
    def get_scraping_stats(self, days: int = 7) -> Dict[str, Any]:
        """Get scraping statistics for the last N days."""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                # Get scraping sessions stats
                cursor.execute("""
                    SELECT 
                        COUNT(*) as total_sessions,
                        SUM(pages_scraped) as total_pages,
                        SUM(tenders_found) as total_tenders,
                        SUM(tenders_new) as new_tenders,
                        SUM(tenders_updated) as updated_tenders,
                        SUM(errors_count) as total_errors,
                        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))/60) as avg_duration_minutes
                    FROM scraping_logs 
                    WHERE started_at >= NOW() - INTERVAL '%s days'
                        AND status = 'completed'
                """, (days,))
                
                session_stats = cursor.fetchone()
                
                # Get tender stats
                cursor.execute("""
                    SELECT 
                        COUNT(*) as active_tenders,
                        COUNT(*) FILTER (WHERE urgency = 'critical') as critical_tenders,
                        COUNT(*) FILTER (WHERE urgency = 'high') as high_tenders,
                        COUNT(*) FILTER (WHERE notified = FALSE) as unnotified_tenders,
                        AVG(value_numeric) as avg_value,
                        MAX(value_numeric) as max_value
                    FROM tenders 
                    WHERE archived = FALSE 
                        AND scraped_at >= NOW() - INTERVAL '%s days'
                """, (days,))
                
                tender_stats = cursor.fetchone()
                cursor.close()
                
                return {
                    'period_days': days,
                    'scraping': {
                        'total_sessions': session_stats[0] or 0,
                        'total_pages': session_stats[1] or 0,
                        'total_tenders': session_stats[2] or 0,
                        'new_tenders': session_stats[3] or 0,
                        'updated_tenders': session_stats[4] or 0,
                        'total_errors': session_stats[5] or 0,
                        'avg_duration_minutes': float(session_stats[6] or 0)
                    },
                    'tenders': {
                        'active_tenders': tender_stats[0] or 0,
                        'critical_tenders': tender_stats[1] or 0,
                        'high_tenders': tender_stats[2] or 0,
                        'unnotified_tenders': tender_stats[3] or 0,
                        'avg_value': float(tender_stats[4] or 0),
                        'max_value': float(tender_stats[5] or 0)
                    }
                }
                
        except Exception as e:
            logger.error(f"❌ Failed to get scraping stats: {e}")
            return {}
    
    def cleanup_old_data(self, days_to_keep: int = 90) -> Dict[str, int]:
        """Clean up old data from database."""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                cleanup_stats = {}
                
                # Archive old completed scraping logs
                cursor.execute("""
                    UPDATE scraping_logs 
                    SET status = 'archived' 
                    WHERE started_at < NOW() - INTERVAL '%s days'
                        AND status = 'completed'
                """, (days_to_keep,))
                cleanup_stats['archived_logs'] = cursor.rowcount
                
                # Delete very old system health records
                cursor.execute("""
                    DELETE FROM system_health 
                    WHERE recorded_at < NOW() - INTERVAL '%s days'
                """, (days_to_keep // 3,))
                cleanup_stats['deleted_health_records'] = cursor.rowcount
                
                # Clean up old translation cache
                cursor.execute("""
                    DELETE FROM translation_cache 
                    WHERE last_used < NOW() - INTERVAL '%s days'
                        AND used_count < 5
                """, (days_to_keep,))
                cleanup_stats['deleted_translations'] = cursor.rowcount
                
                # Archive old tenders
                cursor.execute("""
                    UPDATE tenders 
                    SET archived = TRUE 
                    WHERE scraped_at < NOW() - INTERVAL '%s days'
                        AND status IN ('CLOSED', 'CANCELLED', 'EXPIRED')
                """, (days_to_keep // 2,))
                cleanup_stats['archived_tenders'] = cursor.rowcount
                
                conn.commit()
                cursor.close()
                
                logger.info(f"✅ Cleanup completed: {cleanup_stats}")
                return cleanup_stats
                
        except Exception as e:
            logger.error(f"❌ Failed to cleanup old data: {e}")
            return {}
    
    def close(self):
        """Close database connections."""
        if self._connection_pool:
            self._connection_pool.closeall()
            logger.info("✅ Database connection pool closed")

# Convenience functions for common operations
def create_database_manager(config=None) -> DatabaseManager:
    """Create and return a database manager instance."""
    return DatabaseManager(config)

def test_database_connection(config=None) -> bool:
    """Test database connectivity."""
    db = DatabaseManager(config)
    return db.test_connection()