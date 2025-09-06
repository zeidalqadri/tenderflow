# Enhanced translator.py - Russian to English translation + Multi-currency conversion

import csv
import re
import os
import json
import time
from datetime import datetime, timedelta
import pytz
import requests
import logging
from typing import Dict, List, Optional, Tuple
from googletrans import Translator

# Try to import forex_python, fallback to API-only approach if failed
try:
    from forex_python.converter import CurrencyConverter
    FOREX_PYTHON_AVAILABLE = True
except ImportError:
    FOREX_PYTHON_AVAILABLE = False
    CurrencyConverter = None

# --- CONFIGURATION ---
KZ_TZ = pytz.timezone('Asia/Almaty')
MY_TZ = pytz.timezone('Asia/Kuala_Lumpur')
EXCHANGE_API_USD = "https://api.exchangerate-api.com/v4/latest/KZT"
EXCHANGE_API_MYR = "https://api.freeforexapi.com/api/live?pairs=KZTMYR,KZTUSD"

# Initialize translator and currency converter
translator = Translator()
currency_converter = CurrencyConverter() if FOREX_PYTHON_AVAILABLE else None

# Cache for exchange rates (1 hour validity)
RATE_CACHE = {
    'rates': {},
    'timestamp': None,
    'validity_hours': 1
}

logging.basicConfig(level=logging.INFO)

# --- TRANSLATION FUNCTIONS ---
def translate_russian_to_english(text: str, max_retries: int = 3) -> str:
    """Translate Russian text to English with error handling"""
    if not text or not text.strip():
        return text
    
    # Skip if already in English (simple check)
    if text.isascii() and not any(char in text for char in ['₸', '₽']):
        return text
    
    for attempt in range(max_retries):
        try:
            result = translator.translate(text, src='ru', dest='en')
            return result.text
        except Exception as e:
            logging.warning(f"Translation attempt {attempt+1} failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(1)  # Wait before retry
            else:
                logging.error(f"Translation failed after {max_retries} attempts: {text[:50]}...")
                return text  # Return original if all attempts fail
    
    return text

def translate_batch_text(text_list: List[str]) -> List[str]:
    """Translate a batch of Russian texts to English for efficiency"""
    translated = []
    for text in text_list:
        translated.append(translate_russian_to_english(text))
        time.sleep(0.1)  # Small delay to avoid rate limiting
    return translated

# --- CURRENCY CONVERSION FUNCTIONS ---
def get_exchange_rates() -> Dict[str, float]:
    """Get current KZT exchange rates with caching"""
    global RATE_CACHE
    
    # Check if cache is valid
    if (RATE_CACHE['timestamp'] and 
        datetime.now() - RATE_CACHE['timestamp'] < timedelta(hours=RATE_CACHE['validity_hours'])):
        return RATE_CACHE['rates']
    
    try:
        # Try multiple sources for reliability
        rates = {}
        
        # Method 1: Use forex-python library if available
        if FOREX_PYTHON_AVAILABLE and currency_converter:
            try:
                rates['USD'] = currency_converter.convert(1, 'KZT', 'USD')
                rates['MYR'] = currency_converter.convert(1, 'KZT', 'MYR')
                logging.info("✅ Exchange rates fetched via forex-python")
            except Exception as e:
                logging.warning(f"Forex-python failed: {e}")
                rates = {}  # Clear rates to trigger API fallback
        else:
            rates = {}  # No forex-python, use API
            
        # Method 2: Use free API as fallback
        if not rates:
            try:
                response = requests.get("https://api.exchangerate-api.com/v4/latest/KZT", timeout=10)
                data = response.json()
                rates['USD'] = data['rates'].get('USD', 0.002)
                rates['MYR'] = data['rates'].get('MYR', 0.0078)
                logging.info("✅ Exchange rates fetched via API")
            except Exception as e2:
                logging.warning(f"API fallback failed: {e2}")
                # Use hardcoded fallback rates (approximate values as of 2025)
                rates = {'USD': 0.002, 'MYR': 0.0078}
                logging.info("⚠️ Using fallback exchange rates")
        
        # Cache the rates
        RATE_CACHE['rates'] = rates
        RATE_CACHE['timestamp'] = datetime.now()
        
        return rates
        
    except Exception as e:
        logging.error(f"Failed to get exchange rates: {e}")
        # Return fallback rates
        return {'USD': 0.002, 'MYR': 0.0078}

def parse_kzt_amount(value_str: str) -> float:
    """Parse KZT amount string to float"""
    if not value_str:
        return 0.0
    
    # Remove currency symbol, spaces, and handle comma decimal separator
    clean_value = (value_str.replace('₸', '')
                           .replace(' ', '')
                           .replace('\u00A0', '')  # Non-breaking space
                           .replace(',', '.')
                           .strip())
    
    try:
        return float(clean_value)
    except ValueError:
        logging.warning(f"Could not parse currency value: {value_str}")
        return 0.0

def convert_kzt_to_currencies(value_str: str, rates: Optional[Dict[str, float]] = None) -> Dict[str, str]:
    """Convert KZT amount to USD and MYR"""
    if not rates:
        rates = get_exchange_rates()
    
    kzt_amount = parse_kzt_amount(value_str)
    
    if kzt_amount == 0:
        return {
            'USD': "0.00 USD",
            'MYR': "0.00 MYR",
            'original_kzt': value_str
        }
    
    usd_amount = kzt_amount * rates['USD']
    myr_amount = kzt_amount * rates['MYR']
    
    return {
        'USD': f"{usd_amount:,.2f} USD",
        'MYR': f"{myr_amount:,.2f} MYR", 
        'original_kzt': value_str,
        'rates_used': rates
    }

# Legacy functions for backward compatibility
def get_kzt_to_usd_rate():
    """Legacy function - get USD rate only"""
    rates = get_exchange_rates()
    return rates['USD']

def kzt_to_usd(value_str, rate=None):
    """Legacy function - convert to USD only"""
    if not rate:
        rate = get_kzt_to_usd_rate()
    
    kzt_amount = parse_kzt_amount(value_str)
    usd_amount = kzt_amount * rate
    return f"{usd_amount:,.2f} USD"

# --- TIMEZONE CONVERSION ---
def convert_days_left_to_deadline(days_left_str, current_time):
    # Extract number of days
    match = re.search(r'(\d+)', days_left_str)
    days = int(match.group(1)) if match else 0

    # Assume deadline is days from now in KZ time, then convert to MY time
    now_kz = current_time.astimezone(KZ_TZ)
    deadline_kz = now_kz + timedelta(days=days)
    deadline_my = deadline_kz.astimezone(MY_TZ)
    return deadline_my.strftime('%Y-%m-%d %H:%M:%S %Z')

# --- MAIN PROCESSING ---
def process_csv(input_file, output_file, current_time):
    translator = get_translator()
    kzt_usd_rate = get_kzt_to_usd_rate()

    with open(input_file, newline='', encoding='utf-8') as csvfile_in, \
         open(output_file, 'w', newline='', encoding='utf-8') as csvfile_out:
        reader = csv.DictReader(csvfile_in, delimiter='\t')
        fieldnames = ['id', 'title_en', 'status_en', 'deadline_myt', 'value_usd', 'url']
        writer = csv.DictWriter(csvfile_out, fieldnames=fieldnames)
        writer.writeheader()

        for row in reader:
            title_en = translate_text(row['title'], target='en', translator=translator)
            status_en = translate_text(row['status'], target='en', translator=translator)
            deadline_myt = convert_days_left_to_deadline(row['days_left'], current_time)
            value_usd = kzt_to_usd(row['value'], kzt_usd_rate)
            writer.writerow({
                'id': row['id'],
                'title_en': title_en,
                'status_en': status_en,
                'deadline_myt': deadline_myt,
                'value_usd': value_usd,
                'url': row['url']
            })

if __name__ == "__main__":
    # Use the provided current time
    current_time_str = "Friday, 20 June 2025 at 2:16:40 PM GMT+8"
    current_time = datetime.strptime(current_time_str, "%A, %d %B %Y at %I:%M:%S\u202f%p GMT%z")
    process_csv('input.csv', 'output.csv', current_time)

