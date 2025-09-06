#!/usr/bin/env python3
"""
Debug script to inspect the current zakup.sk.kz website structure
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service
import time

def debug_selectors():
    options = webdriver.ChromeOptions()
    options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    
    try:
        url = "https://zakup.sk.kz/#/ext(popup:search)?tabs=tenders&adst=PUBLISHED&lst=PUBLISHED"
        print(f"🌐 Opening: {url}")
        driver.get(url)
        
        # Wait for page to load
        time.sleep(10)
        
        print("📄 Page title:", driver.title)
        print("🔗 Current URL:", driver.current_url)
        
        # Check for different possible selectors
        selectors_to_check = [
            "div.jhi-item-count",
            ".jhi-item-count",
            "[class*='item-count']",
            "[class*='count']",
            "div.m-found-item",
            ".m-found-item", 
            "[class*='found-item']",
            "[class*='tender']",
            "div[class*='item']",
            "tbody tr",
            ".row",
            "div.card",
            ".list-item"
        ]
        
        print("\n🔍 Checking selectors...")
        for selector in selectors_to_check:
            try:
                elements = driver.find_elements(By.CSS_SELECTOR, selector)
                if elements:
                    print(f"✅ Found {len(elements)} elements with selector: {selector}")
                    if len(elements) <= 5:  # Show text for small counts
                        for i, elem in enumerate(elements):
                            text = elem.text.strip()[:100] if elem.text else "[no text]"
                            print(f"   [{i+1}] {text}")
                else:
                    print(f"❌ No elements found for: {selector}")
            except Exception as e:
                print(f"⚠️ Error with selector '{selector}': {e}")
        
        # Save page source for manual inspection
        print("\n💾 Saving page source...")
        with open("zakup_page_debug.html", "w", encoding="utf-8") as f:
            f.write(driver.page_source)
        print("Saved to: zakup_page_debug.html")
        
        # Take screenshot if possible
        try:
            driver.save_screenshot("zakup_page_debug.png")
            print("Screenshot saved to: zakup_page_debug.png")
        except:
            print("Could not save screenshot")
            
    finally:
        driver.quit()

if __name__ == "__main__":
    debug_selectors()