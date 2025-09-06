#!/usr/bin/env python3
"""
Quick test script to verify the zakup scraper functionality
"""

import sys
import logging
from datetime import datetime
from scraper import get_scraper
from config import TENDER_URL

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

def test_scraper():
    """Test the scraper with a limited sample"""
    try:
        print("🧪 Testing Zakup Scraper...")
        print(f"Target URL: {TENDER_URL}")
        
        with get_scraper(headless=True) as scraper:
            print("✅ Scraper initialized successfully")
            
            # Open the site
            scraper.open_site(TENDER_URL)
            print("✅ Site opened successfully")
            
            # Get total pages (for info)
            total_pages = scraper.get_total_pages()
            print(f"📊 Total pages detected: {total_pages}")
            
            # Test scraping just the first page
            print("🔍 Testing scraping of page 1...")
            tenders = scraper.extract_tenders_from_page(1)
            
            if tenders:
                print(f"✅ Successfully scraped {len(tenders)} tenders from page 1")
                
                # Show sample data
                print("\n📋 Sample tender data:")
                for i, tender in enumerate(tenders[:3]):  # Show first 3
                    print(f"  {i+1}. ID: {tender.get('id', 'N/A')}")
                    print(f"     Title: {tender.get('title', 'N/A')[:80]}...")
                    print(f"     Status: {tender.get('status', 'N/A')}")
                    print(f"     Value: {tender.get('value', 'N/A')}")
                    print(f"     Days Left: {tender.get('days_left', 'N/A')}")
                    print(f"     URL: {tender.get('url', 'N/A')}")
                    print()
                
                return True
            else:
                print("❌ No tenders found on page 1")
                return False
                
    except Exception as e:
        print(f"❌ Scraper test failed: {e}")
        logging.error(f"Scraper test error: {e}")
        return False

def test_translator():
    """Test the translation functionality"""
    try:
        print("\n🌐 Testing Translation...")
        from translator import translate_russian_to_english, convert_kzt_to_currencies
        
        # Test translation
        test_text = "Закупка компьютерного оборудования"
        translated = translate_russian_to_english(test_text)
        print(f"Original: {test_text}")
        print(f"Translated: {translated}")
        
        # Test currency conversion
        test_value = "5,000,000 ₸"
        converted = convert_kzt_to_currencies(test_value)
        print(f"\nOriginal: {test_value}")
        print(f"USD: {converted['USD']}")
        print(f"MYR: {converted['MYR']}")
        
        print("✅ Translation test completed")
        return True
        
    except Exception as e:
        print(f"❌ Translation test failed: {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("ZAKUP SCRAPER FUNCTIONALITY TEST")
    print("=" * 60)
    
    # Test scraper
    scraper_ok = test_scraper()
    
    # Test translator
    translator_ok = test_translator()
    
    print("\n" + "=" * 60)
    print("TEST RESULTS")
    print("=" * 60)
    print(f"Scraper: {'✅ PASS' if scraper_ok else '❌ FAIL'}")
    print(f"Translator: {'✅ PASS' if translator_ok else '❌ FAIL'}")
    
    if scraper_ok and translator_ok:
        print("\n🎉 All tests passed! Scraper is ready for integration.")
        sys.exit(0)
    else:
        print("\n⚠️ Some tests failed. Check logs above.")
        sys.exit(1)