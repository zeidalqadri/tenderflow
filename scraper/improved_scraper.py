#!/usr/bin/env python3
"""
Improved scraper that handles Angular SPA loading
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service
import time
import json

def improved_scraper_test():
    options = webdriver.ChromeOptions()
    options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-blink-features=AutomationControlled')
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    
    try:
        url = "https://zakup.sk.kz/#/ext(popup:search)?tabs=tenders&adst=PUBLISHED&lst=PUBLISHED"
        print(f"🌐 Opening: {url}")
        driver.get(url)
        
        # Wait longer for Angular to load
        print("⏳ Waiting for Angular app to load...")
        time.sleep(15)
        
        print("📄 Page title:", driver.title)
        print("🔗 Current URL:", driver.current_url)
        
        # Try to find any visible content
        print("\n🔍 Looking for any visible elements...")
        
        # Check if we're on the correct page by looking for specific text or elements
        page_text = driver.find_element(By.TAG_NAME, "body").text
        
        if "закупок" in page_text.lower() or "tender" in page_text.lower() or "tender" in driver.title.lower():
            print("✅ Successfully loaded a page related to tenders")
        else:
            print("❌ Page doesn't seem to contain tender-related content")
            
        # Try different approaches to find tender data
        potential_selectors = [
            # General content containers
            "div[class*='content']",
            "div[class*='main']",
            "div[class*='list']",
            "div[class*='grid']",
            "div[class*='row']",
            "div[class*='item']",
            "div[class*='card']",
            "div[class*='tender']",
            "div[class*='search']",
            "div[class*='result']",
            # Angular specific
            "ng-component",
            "[ng-reflect]",
            "router-outlet + *",
            # Table structures
            "table",
            "tbody",
            "tr",
            # Modern web structures
            ".container",
            ".wrapper",
            "article",
            "section"
        ]
        
        found_elements = []
        for selector in potential_selectors:
            try:
                elements = driver.find_elements(By.CSS_SELECTOR, selector)
                if elements:
                    for elem in elements:
                        text = elem.text.strip()
                        if text and len(text) > 20:  # Only interested in elements with substantial text
                            found_elements.append({
                                'selector': selector,
                                'text': text[:200] + "..." if len(text) > 200 else text,
                                'tag': elem.tag_name,
                                'classes': elem.get_attribute('class')
                            })
                            
            except Exception as e:
                continue
        
        if found_elements:
            print(f"\n📋 Found {len(found_elements)} elements with content:")
            for i, elem in enumerate(found_elements[:10]):  # Show first 10
                print(f"  [{i+1}] Tag: {elem['tag']}, Selector: {elem['selector']}")
                print(f"      Classes: {elem['classes']}")
                print(f"      Text: {elem['text']}")
                print()
        else:
            print("\n❌ No substantial content found")
            
        # Check if we need to navigate or interact with elements
        print("\n🔍 Looking for navigation elements...")
        nav_selectors = [
            "a[href*='search']",
            "button[class*='search']", 
            "input[type='search']",
            "a[class*='nav']",
            "button[class*='nav']",
            "div[class*='menu']",
            "div[class*='navigation']"
        ]
        
        for selector in nav_selectors:
            try:
                elements = driver.find_elements(By.CSS_SELECTOR, selector)
                if elements:
                    print(f"Found navigation element: {selector} ({len(elements)} elements)")
                    for elem in elements[:3]:
                        print(f"  - {elem.text} | href/onclick: {elem.get_attribute('href') or elem.get_attribute('onclick')}")
            except:
                continue
                
        # Save current page state for analysis
        with open("improved_page_source.html", "w", encoding="utf-8") as f:
            f.write(driver.page_source)
        print("\n💾 Page source saved to: improved_page_source.html")
        
        # Try to execute JavaScript to get more info
        try:
            js_info = driver.execute_script("""
                return {
                    url: window.location.href,
                    title: document.title,
                    readyState: document.readyState,
                    angular: typeof angular !== 'undefined',
                    jquery: typeof $ !== 'undefined',
                    divCount: document.querySelectorAll('div').length,
                    hasRouter: document.querySelector('router-outlet') !== null
                };
            """)
            print(f"\n🔧 JavaScript info: {json.dumps(js_info, indent=2)}")
        except Exception as e:
            print(f"⚠️ Could not execute JavaScript: {e}")
            
    finally:
        driver.quit()

if __name__ == "__main__":
    improved_scraper_test()