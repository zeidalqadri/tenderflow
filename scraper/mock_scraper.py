#!/usr/bin/env python3
"""
Mock scraper that generates realistic tender data for testing TenderFlow integration.
This simulates the structure and format that would come from zakup.sk.kz
"""

import json
import csv
import time
import random
from datetime import datetime, timedelta
from typing import List, Dict
from translator import convert_kzt_to_currencies, translate_russian_to_english

class MockTenderScraper:
    """Mock scraper for development and testing purposes"""
    
    def __init__(self):
        self.base_titles_ru = [
            "Закупка компьютерного оборудования для офиса",
            "Строительство дорожного покрытия",
            "Поставка медицинского оборудования", 
            "Консультационные услуги по IT",
            "Ремонт административного здания",
            "Поставка канцелярских товаров",
            "Разработка программного обеспечения",
            "Закупка автомобилей служебного назначения",
            "Услуги по уборке территории",
            "Поставка мебели для учреждений",
            "Консультации по финансовым вопросам",
            "Закупка электрического оборудования",
            "Строительство жилых домов",
            "Поставка продуктов питания",
            "Услуги по охране объектов"
        ]
        
        self.statuses_ru = [
            "Опубликован",
            "Активный",
            "Ожидание подачи заявок",
            "Прием заявок",
            "На рассмотрении"
        ]
        
    def generate_mock_tenders(self, count: int = 50) -> List[Dict]:
        """Generate mock tender data"""
        tenders = []
        
        for i in range(count):
            # Generate base data
            tender_id = f"KZ-{2025}-{random.randint(1000, 9999)}-{i+1:03d}"
            
            # Random title
            title_ru = random.choice(self.base_titles_ru)
            if random.random() < 0.3:  # 30% chance to add variation
                title_ru += f" (партия {random.randint(1, 5)})"
                
            # Random status
            status_ru = random.choice(self.statuses_ru)
            
            # Random value in KZT
            base_values = [500000, 1000000, 2500000, 5000000, 10000000, 25000000, 50000000]
            value_kzt = random.choice(base_values) + random.randint(-200000, 500000)
            value_str = f"{value_kzt:,} ₸".replace(",", " ")
            
            # Random days left
            days_left = random.randint(1, 45)
            days_left_str = f"до {days_left} дней" if days_left > 1 else "до 1 дня"
            
            # Generate URL
            url = f"https://zakup.sk.kz/#/ext(popup:item/{tender_id})/advert)"
            
            tender = {
                "id": tender_id,
                "title": title_ru,
                "status": status_ru, 
                "days_left": days_left_str,
                "value": value_str,
                "url": url,
                # Additional metadata
                "scraped_at": datetime.now().isoformat(),
                "source": "zakup.sk.kz",
                "category": random.choice(["IT_SERVICES", "CONSTRUCTION", "SUPPLIES", "CONSULTING", "MAINTENANCE"]),
                "region": random.choice(["Алматы", "Астана", "Шымкент", "Караганда", "Актобе"])
            }
            
            tenders.append(tender)
            
        return tenders
    
    def translate_tenders(self, tenders: List[Dict]) -> List[Dict]:
        """Add translated versions of tender data"""
        print("🌐 Translating tender data...")
        
        for i, tender in enumerate(tenders):
            print(f"  Translating {i+1}/{len(tenders)}: {tender['id']}")
            
            # Translate title
            tender["title_en"] = translate_russian_to_english(tender["title"])
            
            # Translate status  
            tender["status_en"] = translate_russian_to_english(tender["status"])
            
            # Convert currency
            currency_info = convert_kzt_to_currencies(tender["value"])
            tender["value_usd"] = currency_info["USD"]
            tender["value_myr"] = currency_info["MYR"]
            tender["exchange_rates"] = currency_info.get("rates_used", {})
            
            # Calculate deadline
            days_match = [int(s) for s in tender["days_left"].split() if s.isdigit()]
            if days_match:
                days = days_match[0]
                deadline = datetime.now() + timedelta(days=days)
                tender["deadline"] = deadline.isoformat()
            
            time.sleep(0.1)  # Small delay to avoid rate limiting
            
        return tenders

def generate_mock_data():
    """Generate and save mock tender data"""
    scraper = MockTenderScraper()
    
    print("🏭 Generating mock tender data...")
    tenders = scraper.generate_mock_tenders(count=30)
    
    print("🌐 Adding translations and currency conversions...")
    tenders = scraper.translate_tenders(tenders)
    
    # Save to CSV
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    csv_file = f"mock_tender_data_{timestamp}.csv"
    
    with open(csv_file, 'w', newline='', encoding='utf-8') as f:
        fieldnames = ['id', 'title', 'title_en', 'status', 'status_en', 'days_left', 
                     'value', 'value_usd', 'value_myr', 'url', 'deadline', 'category', 'region']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        
        for tender in tenders:
            writer.writerow({k: v for k, v in tender.items() if k in fieldnames})
    
    # Save to JSON  
    json_file = f"mock_tender_data_{timestamp}.json"
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(tenders, f, ensure_ascii=False, indent=2)
    
    print(f"✅ Generated {len(tenders)} mock tenders")
    print(f"📁 CSV saved to: {csv_file}")
    print(f"📁 JSON saved to: {json_file}")
    
    return csv_file, json_file, tenders

if __name__ == "__main__":
    print("=" * 60)
    print("MOCK TENDER DATA GENERATOR")
    print("=" * 60)
    
    csv_file, json_file, tenders = generate_mock_data()
    
    print(f"\n📊 Sample data preview:")
    for tender in tenders[:3]:
        print(f"  ID: {tender['id']}")
        print(f"  Title (RU): {tender['title']}")
        print(f"  Title (EN): {tender['title_en']}")
        print(f"  Value: {tender['value']} → {tender['value_usd']}")
        print(f"  Status: {tender['status']} → {tender['status_en']}")
        print()
    
    print("🎉 Mock data generation complete! Ready for TenderFlow integration.")