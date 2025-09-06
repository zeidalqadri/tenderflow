/**
 * TypeScript interfaces for the scraper service
 */

export interface ScrapedTender {
  id: string;
  title: string;
  status: string;
  days_left: string;
  value: string;
  url: string;
}

export interface ScrapingOptions {
  maxPages?: number;
  minValue?: number;
  maxDaysLeft?: number;
  workers?: number;
  headless?: boolean;
  sourcePortal?: string;
  tenantId?: string;
}

export interface ScrapingResult {
  success: boolean;
  tendersFound: number;
  tendersImported: number;
  tendersUpdated: number;
  tendersSkipped: number;
  pagesProcessed: number;
  totalPages?: number;
  duration: number;
  errorMessage?: string;
  errorDetails?: any;
}

export interface ScrapingProgress {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentPage?: number;
  totalPages?: number;
  tendersProcessed?: number;
  message?: string;
}

export interface TransformedTender {
  externalId: string;
  title: string;
  originalTitle: string;
  status: 'SCRAPED' | 'VALIDATED' | 'QUALIFIED' | 'IN_BID' | 'SUBMITTED' | 'WON' | 'LOST' | 'ARCHIVED';
  originalStatus: string;
  category: 'CONSTRUCTION' | 'IT_SERVICES' | 'CONSULTING' | 'SUPPLIES' | 'MAINTENANCE' | 'RESEARCH' | 'TRAINING' | 'OTHER';
  publishedAt?: Date;
  deadline?: Date;
  estimatedValue?: number;
  currency: string;
  originalValue: string;
  exchangeRates?: {
    from: string;
    to: string;
    rate: number;
    timestamp: Date;
  };
  sourcePortal: string;
  sourceUrl: string;
  scrapedAt: Date;
  metadata: Record<string, any>;
}

export interface ScrapingLog {
  id: string;
  tenantId: string;
  sourcePortal: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  startedAt: Date;
  completedAt?: Date;
  pagesProcessed: number;
  totalPages?: number;
  tendersFound: number;
  tendersImported: number;
  tendersUpdated: number;
  tendersSkipped: number;
  errorMessage?: string;
  errorDetails?: any;
  metadata: Record<string, any>;
  triggeredBy: string;
}

export interface ScrapingStats {
  totalTenders: number;
  tendersThisWeek: number;
  tendersThisMonth: number;
  lastScrapedAt?: Date;
  averageScrapingTime: number;
  successRate: number;
  topCategories: Array<{
    category: string;
    count: number;
  }>;
  valueDistribution: {
    small: number; // < $10k
    medium: number; // $10k - $100k
    large: number; // > $100k
  };
}

export type ScrapingJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ScrapingJob {
  id: string;
  status: ScrapingJobStatus;
  options: ScrapingOptions;
  result?: ScrapingResult;
  progress?: ScrapingProgress;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
}