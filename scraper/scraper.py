# scraper.py
import math
import re
import csv
import logging
from typing import List, Dict, Optional
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.common.exceptions import TimeoutException, WebDriverException, StaleElementReferenceException
from datetime import datetime
from contextlib import contextmanager
from config import TENDER_URL, TENDER_PAGE_URL, TENDERS_PER_PAGE, CSV_FIELDS
from pagination_handler import PaginationHandler
import time

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

class TenderScraper:
    def __init__(self, headless: bool = True):
        options = webdriver.ChromeOptions()
        if headless:
            options.add_argument('--headless=new')
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--window-size=1920,1080')
        options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
        self.driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
        self.wait = WebDriverWait(self.driver, 20)
        self.pagination = None

    def open_site(self, url: str) -> None:
        # First go to main page
        main_url = "https://zakup.sk.kz/#/ext"
        logging.info(f"Opening main page: {main_url}")
        self.driver.get(main_url)
        
        # Wait for main page to load
        time.sleep(5)
        
        # Now navigate to search/tenders page
        logging.info(f"Navigating to: {url}")
        self.driver.get(url)
        
        # Wait for Angular app to load
        logging.info("Waiting for Angular app to load...")
        time.sleep(12)  # Give more time for Angular to load
        
        # Wait for tender items to appear
        try:
            self.wait.until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "div.m-found-item"))
            )
            logging.info("✅ Tender items found on page")
            
            # Initialize pagination handler
            self.pagination = PaginationHandler(self.driver, self.wait)
            
        except TimeoutException:
            logging.warning("⚠️ No tender items found initially, continuing anyway...")
            # Still initialize pagination handler for diagnostics
            self.pagination = PaginationHandler(self.driver, self.wait)

    def get_total_pages(self) -> int:
        """Use the enhanced pagination handler to get total pages"""
        if not self.pagination:
            logging.warning("Pagination handler not initialized")
            return 1
            
        try:
            pagination_info = self.pagination.detect_pagination_info()
            total_pages = pagination_info.get('total_pages', 1)
            
            logging.info(f"📊 {self.pagination.get_pagination_summary()}")
            return total_pages
            
        except Exception as e:
            logging.error(f"Failed to get total pages: {e}")
            return 5  # Safe fallback

    def extract_tenders_from_page(self, page: int) -> List[Dict[str, str]]:
        """Extract tenders from a specific page using enhanced pagination"""
        if page == 1:
            # Already on page 1, don't reload
            logging.info(f"Extracting from current page (page 1)")
        else:
            # Use pagination handler for reliable navigation
            if self.pagination and hasattr(self.pagination, 'navigate_to_page'):
                success = self.pagination.navigate_to_page(page)
                if not success:
                    logging.error(f"Failed to navigate to page {page}")
                    return []
            else:
                # Fallback to direct URL navigation
                url = TENDER_PAGE_URL.format(page=page)
                logging.info(f"Loading page {page}: {url}")
                self.driver.get(url)
                time.sleep(10)
        
        max_retries = 3
        for attempt in range(1, max_retries + 1):
            tenders = []
            try:
                # Wait for tender items to be present
                self.wait.until(EC.presence_of_all_elements_located((By.CSS_SELECTOR, "div.m-found-item")))
                tender_elements = self.driver.find_elements(By.CSS_SELECTOR, "div.m-found-item")
                
                logging.info(f"Found {len(tender_elements)} tender elements on page {page}")
                
                for idx, tender in enumerate(tender_elements):
                    try:
                        # Extract tender ID
                        tender_id = self.safe_get_text(tender, "div.m-found-item__num")
                        tender_id = tender_id.replace("№", "").strip()
                        
                        # Extract title
                        title = self.safe_get_text(tender, "h3.m-found-item__title")
                        
                        # Extract status/type (e.g., "Открытый тендер")
                        # Get all layout divs and find the one with status text
                        layouts = tender.find_elements(By.CSS_SELECTOR, "div.m-found-item__layout")
                        status = ""
                        for layout in layouts:
                            layout_text = layout.text.strip()
                            # Skip if it contains "Осталось" or "Стоимость" (these are in cols)
                            if layout_text and "Осталось" not in layout_text and "Стоимость" not in layout_text:
                                status = layout_text
                                break
                        
                        # Extract days left
                        days_left = self.safe_get_text(
                            tender, "span.m-span.m-span--danger, span.m-span.m-span--success", default="N/A"
                        )
                        
                        # Extract value
                        value_elem = tender.find_elements(By.CSS_SELECTOR, "div.m-found-item__col--sum span.m-span--dark")
                        value = value_elem[0].text.strip() if value_elem else "0 ₸"
                        
                        # Build tender URL
                        tender_url = f"https://zakup.sk.kz/#/ext(popup:item/{tender_id}/advert)?tabs=advert&adst=PUBLISHED&lst=PUBLISHED&page={page}"
                        
                        tenders.append({
                            "id": tender_id,
                            "title": title,
                            "status": status,
                            "days_left": days_left,
                            "value": value,
                            "url": tender_url
                        })
                        
                        logging.debug(f"Extracted tender {tender_id}: {title[:50]}...")
                        
                    except StaleElementReferenceException:
                        logging.warning(f"Stale element in tender idx {idx} on page {page}, skipping this tender.")
                        continue
                    except Exception as e:
                        logging.warning(f"Could not extract tender data at idx {idx} on page {page}: {e}")
                
                if tenders:
                    logging.info(f"✅ Successfully extracted {len(tenders)} tenders from page {page}")
                return tenders  # Success, return results
                
            except TimeoutException:
                logging.warning(f"[Attempt {attempt}/{max_retries}] Timeout waiting for tender items on page {page}")
                if attempt < max_retries:
                    time.sleep(3)
                    continue
                else:
                    return []
            except StaleElementReferenceException:
                logging.warning(f"[Attempt {attempt}/{max_retries}] Stale element encountered on page {page}, retrying...")
                time.sleep(2)
                continue
            except WebDriverException as e:
                logging.error(f"Browser session error on page {page}: {e}")
                break
                
        logging.error(f"Failed to extract tenders from page {page} after {max_retries} attempts.")
        return []

    @staticmethod
    def safe_get_text(element, selector: str, default: str = "") -> str:
        try:
            elems = element.find_elements(By.CSS_SELECTOR, selector)
            if elems:
                text = elems[0].text.strip()
                return text if text else default
            return default
        except:
            return default

    def close(self) -> None:
        self.driver.quit()

@contextmanager
def get_scraper(headless: bool = True):
    scraper = TenderScraper(headless)
    try:
        yield scraper
    finally:
        scraper.close()

def parse_value(value_str: str) -> float:
    value_str = value_str.replace('\xa0', '').replace(' ', '').replace('₸', '').replace(',', '.').strip()
    try:
        return float(value_str)
    except Exception:
        return 0.0

def parse_days_left(days_str: str) -> Optional[int]:
    # Extract number from strings like "13 дня", "6 дней", "3 дня"
    match = re.search(r'(\d+)', days_str)
    if match:
        return int(match.group(1))
    return None

def scrape_page_range_worker(args):
    start_page, end_page, headless, min_value, max_days_left = args
    scraper = TenderScraper(headless=headless)
    all_tenders = []
    try:
        # Open site once
        scraper.open_site(TENDER_URL)
        
        for page in range(start_page, end_page + 1):
            tenders = scraper.extract_tenders_from_page(page)
            for tender in tenders:
                value = parse_value(tender.get("value", "0"))
                days_left = parse_days_left(tender.get("days_left", "N/A"))
                if value < min_value:
                    continue
                if max_days_left is not None and (days_left is None or days_left > max_days_left):
                    continue
                all_tenders.append(tender)
    finally:
        scraper.close()
    return all_tenders

def save_results(results: List[Dict[str, str]]) -> str:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"tender_data_{timestamp}.csv"
    with open(filename, "w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(results)
    return filename