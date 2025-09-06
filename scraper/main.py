# main.py
import argparse
import logging
import subprocess
import os
import math
from multiprocessing import Pool, cpu_count
from tqdm import tqdm
from scraper import get_scraper, save_results, scrape_page_range_worker
from config import TENDER_URL

def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

def chunkify(total_pages, num_workers):
    """Enhanced page chunking that distributes pages more evenly"""
    if total_pages <= 0 or num_workers <= 0:
        return []
    
    # Use integer division for more even distribution
    base_pages_per_worker = total_pages // num_workers
    extra_pages = total_pages % num_workers
    
    ranges = []
    start_page = 1
    
    for i in range(num_workers):
        # Give extra pages to first few workers
        pages_for_this_worker = base_pages_per_worker + (1 if i < extra_pages else 0)
        
        if pages_for_this_worker > 0:
            end_page = start_page + pages_for_this_worker - 1
            ranges.append((start_page, end_page))
            start_page = end_page + 1
        
        if start_page > total_pages:
            break
    
    return ranges

def prompt_next_action(csv_file):
    while True:
        print("\nWhat would you like to do next?")
        print("1. Translate the scraped output")
        print("2. Exit")
        choice = input("Enter your choice (1/2): ").strip()
        if choice == '1':
            logging.info("Starting translation of scraped data...")
            # Pass current time to translator.py for timezone conversion
            from datetime import datetime
            import pytz
            current_time = datetime.now(pytz.timezone('Asia/Kuala_Lumpur'))
            current_time_str = current_time.strftime("%A, %d %B %Y at %I:%M:%S\u202f%p GMT%z")
            subprocess.run([
                "python3", "translator.py", 
                "--input", csv_file, 
                "--output", f"{os.path.splitext(csv_file)[0]}-EN.csv",
                "--current-time", current_time_str
            ], check=True)
            print("✅ Translation complete.")
            break
        elif choice == '2':
            logging.info("Exiting as per user request.")
            break
        else:
            print("Invalid choice. Please enter 1 or 2.")

def main():
    setup_logging()
    parser = argparse.ArgumentParser(description="Tender Scraper CLI")
    parser.add_argument('--mode', choices=['scrape', 'translate'], required=True, help="Operation mode")
    parser.add_argument('--headless', action='store_true', help="Run browser in headless mode")
    parser.add_argument('--workers', type=int, default=cpu_count(), help="Number of parallel workers for scraping")
    parser.add_argument('--min-value', type=float, default=0, help="Minimum tender value (in KZT)")
    parser.add_argument('--days-left', type=int, default=None, help="Maximum days left before closing")
    args = parser.parse_args()

    if args.mode == 'scrape':
        logging.info("========== TENDER SCRAPING STARTED ==========")
        try:
            with get_scraper(headless=args.headless) as scraper:
                logging.info("Opening tender site...")
                scraper.open_site(TENDER_URL)
                total_pages = scraper.get_total_pages()
            logging.info(f"Total pages detected: {total_pages}")

            ranges = chunkify(total_pages, args.workers)
            worker_args = [
                (start, end, args.headless, args.min_value, args.days_left)
                for (start, end) in ranges
            ]

            all_tenders = []
            logging.info(f"Scraping with {args.workers} workers. Each worker will process a range of pages.")
            with Pool(processes=args.workers) as pool:
                for tenders in tqdm(pool.imap_unordered(scrape_page_range_worker, worker_args), total=len(worker_args), desc="Scraping page ranges"):
                    all_tenders.extend(tenders)

            csv_file = save_results(all_tenders)
            logging.info(f"✅ Scraping complete. {len(all_tenders)} tenders saved to {csv_file}")

            print("\n========== SCRAPING SUMMARY ==========")
            print(f"Total tenders scraped: {len(all_tenders)}")
            print(f"Results saved to: {csv_file}")

            prompt_next_action(csv_file)

        except Exception as e:
            logging.error(f"❌ Fatal error during scraping: {e}")
    elif args.mode == 'translate':
        logging.info("========== TRANSLATION MODULE ==========")
        # Prompt for input/output/current_time if not provided
        input_file = input("Enter the path to the CSV file to translate: ").strip()
        output_file = input("Enter the desired output file name: ").strip()
        from datetime import datetime
        import pytz
        current_time = datetime.now(pytz.timezone('Asia/Kuala_Lumpur'))
        current_time_str = current_time.strftime("%A, %d %B %Y at %I:%M:%S\u202f%p GMT%z")
        subprocess.run([
            "python3", "translator.py", 
            "--input", input_file, 
            "--output", output_file,
            "--current-time", current_time_str
        ], check=True)
        print("✅ Translation complete.")

if __name__ == "__main__":
    main()

