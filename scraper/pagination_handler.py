#!/usr/bin/env python3
"""
Robust pagination handler for zakup.sk.kz scraper
Handles pagination like a champion with proper error handling and validation
"""

import re
import logging
import time
from typing import Optional, List, Dict, Tuple
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

logger = logging.getLogger(__name__)

class PaginationHandler:
    """Enhanced pagination handler with robust error handling"""
    
    def __init__(self, driver: webdriver.Chrome, wait: WebDriverWait):
        self.driver = driver
        self.wait = wait
        self.current_page = 1
        self.total_pages = None
        self.total_items = None
        self.items_per_page = 10  # Default from zakup.sk.kz
        
    def detect_pagination_info(self) -> Dict[str, any]:
        """
        Detect comprehensive pagination information from the current page
        Returns dict with total_pages, total_items, current_page, items_per_page
        """
        info = {
            'total_pages': 1,
            'total_items': 0,
            'current_page': 1,
            'items_per_page': 10,
            'has_next': False,
            'has_previous': False
        }
        
        try:
            # Wait for pagination elements to stabilize
            time.sleep(2)
            
            # Method 1: Try to find total count in header
            info.update(self._extract_from_header())
            
            # Method 2: Try to extract from pagination footer
            pagination_info = self._extract_from_pagination_footer()
            if pagination_info:
                info.update(pagination_info)
            
            # Method 3: Count actual items on current page
            actual_items = self._count_items_on_page()
            if actual_items > 0:
                info['items_on_current_page'] = actual_items
                # Update items_per_page if we have a better estimate
                if info['current_page'] == 1:
                    info['items_per_page'] = actual_items
            
            # Method 4: Analyze pagination buttons
            nav_info = self._analyze_pagination_buttons()
            info.update(nav_info)
            
            # Final calculations and validation
            info = self._validate_and_calculate(info)
            
            # Cache the results
            self.total_pages = info['total_pages']
            self.total_items = info['total_items']
            self.current_page = info['current_page']
            self.items_per_page = info['items_per_page']
            
            logger.info(f"📊 Pagination detected: {info['total_items']} items across {info['total_pages']} pages")
            
            return info
            
        except Exception as e:
            logger.error(f"Failed to detect pagination info: {e}")
            return info  # Return defaults
    
    def _extract_from_header(self) -> Dict[str, any]:
        """Extract pagination info from header section"""
        info = {}
        
        try:
            # Look for "Найдено X Y" pattern
            selectors = [
                "div.m-sidebar__layout span[jhitranslate='main.results.finding']",
                "div.m-sidebar__layout.ng-star-inserted",
                "div.m-sidebar__layout"
            ]
            
            for selector in selectors:
                try:
                    elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
                    for elem in elements:
                        text = elem.text
                        if "Найдено" in text or ("найден" in text.lower()):
                            # Try to extract number after "Найдено"
                            # Handle formats like "Найдено 1 815" or "Найдено 1815"
                            parent_text = elem.find_element(By.XPATH, "..").text if elem.tag_name != 'div' else text
                            numbers = re.findall(r'\d+', parent_text.replace(' ', '').replace('\xa0', ''))
                            if numbers:
                                total_items = int(''.join(numbers))
                                if total_items > 10:  # Sanity check
                                    info['total_items'] = total_items
                                    info['total_pages'] = max(1, (total_items + self.items_per_page - 1) // self.items_per_page)
                                    logger.debug(f"Found total from header: {total_items} items")
                                    break
                except Exception:
                    continue
                    
        except Exception as e:
            logger.debug(f"Could not extract from header: {e}")
            
        return info
    
    def _extract_from_pagination_footer(self) -> Optional[Dict[str, any]]:
        """Extract pagination info from footer pagination display"""
        try:
            # Look for "Показано X - Y из Z элементов"
            item_count_elem = self.driver.find_element(By.CSS_SELECTOR, "div.jhi-item-count")
            text = item_count_elem.text
            
            # Pattern: "Показано 1 - 10 из 1815 элементов"
            match = re.search(r'Показано\s+(\d+)\s*-\s*(\d+)\s+из\s+([\d\s]+)\s+элементов', text)
            if match:
                start_item = int(match.group(1))
                end_item = int(match.group(2))
                total_items = int(match.group(3).replace(' ', ''))
                
                items_per_page = end_item - start_item + 1
                current_page = (start_item - 1) // items_per_page + 1
                total_pages = (total_items + items_per_page - 1) // items_per_page
                
                logger.debug(f"Footer pagination: page {current_page}/{total_pages}, {total_items} items")
                
                return {
                    'total_items': total_items,
                    'total_pages': total_pages,
                    'current_page': current_page,
                    'items_per_page': items_per_page,
                    'start_item': start_item,
                    'end_item': end_item
                }
                
        except Exception as e:
            logger.debug(f"Could not extract from footer: {e}")
            
        return None
    
    def _count_items_on_page(self) -> int:
        """Count actual tender items on current page"""
        try:
            items = self.driver.find_elements(By.CSS_SELECTOR, "div.m-found-item")
            count = len(items)
            logger.debug(f"Found {count} items on current page")
            return count
        except Exception as e:
            logger.debug(f"Could not count items: {e}")
            return 0
    
    def _analyze_pagination_buttons(self) -> Dict[str, any]:
        """Analyze pagination navigation buttons"""
        info = {'has_next': False, 'has_previous': False, 'visible_pages': []}
        
        try:
            # Look for pagination container
            pagination_container = self.driver.find_element(By.CSS_SELECTOR, "ngb-pagination ul.pagination")
            
            # Check for previous/next buttons
            prev_buttons = pagination_container.find_elements(By.CSS_SELECTOR, "li.page-item a[aria-label='Previous']")
            next_buttons = pagination_container.find_elements(By.CSS_SELECTOR, "li.page-item a[aria-label='Next']")
            
            info['has_previous'] = len(prev_buttons) > 0 and 'disabled' not in prev_buttons[0].find_element(By.XPATH, "..").get_attribute('class')
            info['has_next'] = len(next_buttons) > 0 and 'disabled' not in next_buttons[0].find_element(By.XPATH, "..").get_attribute('class')
            
            # Extract visible page numbers
            page_links = pagination_container.find_elements(By.CSS_SELECTOR, "li.page-item a.page-link")
            visible_pages = []
            current_page = None
            
            for link in page_links:
                text = link.text.strip()
                if text.isdigit():
                    page_num = int(text)
                    visible_pages.append(page_num)
                    
                    # Check if this is the current page
                    parent_li = link.find_element(By.XPATH, "..")
                    if 'active' in parent_li.get_attribute('class'):
                        current_page = page_num
            
            if visible_pages:
                info['visible_pages'] = visible_pages
                info['max_visible_page'] = max(visible_pages)
                
            if current_page:
                info['current_page'] = current_page
                
            logger.debug(f"Pagination buttons analysis: {info}")
            
        except Exception as e:
            logger.debug(f"Could not analyze pagination buttons: {e}")
            
        return info
    
    def _validate_and_calculate(self, info: Dict[str, any]) -> Dict[str, any]:
        """Validate and perform final calculations on pagination info"""
        
        # Ensure minimum values
        info['total_items'] = max(info.get('total_items', 0), 0)
        info['total_pages'] = max(info.get('total_pages', 1), 1)
        info['current_page'] = max(info.get('current_page', 1), 1)
        info['items_per_page'] = max(info.get('items_per_page', 10), 1)
        
        # Recalculate total_pages if we have total_items
        if info['total_items'] > 0:
            calculated_pages = (info['total_items'] + info['items_per_page'] - 1) // info['items_per_page']
            info['total_pages'] = max(info['total_pages'], calculated_pages)
        
        # Ensure current_page doesn't exceed total_pages
        info['current_page'] = min(info['current_page'], info['total_pages'])
        
        # Set navigation flags based on current position
        info['has_previous'] = info.get('has_previous', info['current_page'] > 1)
        info['has_next'] = info.get('has_next', info['current_page'] < info['total_pages'])
        
        return info
    
    def navigate_to_page(self, page_number: int) -> bool:
        """
        Navigate to a specific page number with robust error handling
        Returns True if navigation was successful
        """
        if page_number < 1:
            logger.error(f"Invalid page number: {page_number}")
            return False
            
        if self.total_pages and page_number > self.total_pages:
            logger.warning(f"Page {page_number} exceeds total pages {self.total_pages}")
            return False
            
        try:
            # Build URL with page parameter
            current_url = self.driver.current_url
            base_url = current_url.split('&page=')[0].split('?page=')[0]
            
            # Add page parameter
            separator = '&' if '?' in base_url else '?'
            if 'page=' in current_url:
                # Replace existing page parameter
                new_url = re.sub(r'[&?]page=\d+', f'{separator}page={page_number}', current_url)
            else:
                # Add new page parameter
                new_url = f"{base_url}{separator}page={page_number}"
            
            logger.info(f"Navigating to page {page_number}: {new_url}")
            self.driver.get(new_url)
            
            # Wait for page to load
            time.sleep(8)
            
            # Wait for tender items to appear
            try:
                self.wait.until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "div.m-found-item"))
                )
                
                # Update current page
                self.current_page = page_number
                logger.info(f"✅ Successfully navigated to page {page_number}")
                return True
                
            except TimeoutException:
                logger.error(f"Timeout waiting for items on page {page_number}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to navigate to page {page_number}: {e}")
            return False
    
    def get_page_range_for_workers(self, num_workers: int, max_pages: Optional[int] = None) -> List[Tuple[int, int]]:
        """
        Split pages optimally across workers
        Returns list of (start_page, end_page) tuples
        """
        if not self.total_pages:
            self.detect_pagination_info()
        
        total_pages_to_scrape = min(max_pages or self.total_pages, self.total_pages)
        
        if total_pages_to_scrape <= 0:
            return []
        
        if num_workers <= 0:
            num_workers = 1
            
        # Calculate pages per worker
        pages_per_worker = max(1, total_pages_to_scrape // num_workers)
        
        ranges = []
        start_page = 1
        
        for i in range(num_workers):
            if start_page > total_pages_to_scrape:
                break
                
            if i == num_workers - 1:
                # Last worker gets remaining pages
                end_page = total_pages_to_scrape
            else:
                end_page = min(start_page + pages_per_worker - 1, total_pages_to_scrape)
            
            if start_page <= end_page:
                ranges.append((start_page, end_page))
                start_page = end_page + 1
        
        logger.info(f"📝 Page ranges for {num_workers} workers: {ranges}")
        return ranges
    
    def has_more_pages(self) -> bool:
        """Check if there are more pages to scrape"""
        return self.current_page < (self.total_pages or 1)
    
    def get_pagination_summary(self) -> str:
        """Get human-readable pagination summary"""
        if not self.total_pages:
            return "Pagination info not detected"
            
        return (f"Page {self.current_page} of {self.total_pages} "
                f"({self.total_items} items, ~{self.items_per_page} per page)")

def test_pagination():
    """Test pagination detection"""
    from scraper import get_scraper
    from config import TENDER_URL
    
    print("🧪 Testing pagination detection...")
    
    with get_scraper(headless=True) as scraper:
        scraper.open_site(TENDER_URL)
        
        pagination = PaginationHandler(scraper.driver, scraper.wait)
        info = pagination.detect_pagination_info()
        
        print(f"📊 Pagination Info:")
        for key, value in info.items():
            print(f"  {key}: {value}")
        
        print(f"\n📋 Summary: {pagination.get_pagination_summary()}")
        
        # Test page ranges for different worker counts
        print(f"\n🔀 Worker distribution:")
        for workers in [1, 2, 4, 8]:
            ranges = pagination.get_page_range_for_workers(workers, max_pages=20)
            print(f"  {workers} workers: {ranges}")

if __name__ == "__main__":
    test_pagination()