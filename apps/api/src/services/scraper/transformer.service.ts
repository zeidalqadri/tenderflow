/**
 * Data transformation service for converting scraped tender data to TenderFlow format
 */

import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import type { ScrapedTender, TransformedTender } from './scraper.types';
import { PrismaClient, TenderStatus, TenderCategory } from '../../generated/prisma';
import { createLogger, logError, logWarning } from '../../utils/logger';

const logger = createLogger('SCRAPER_TRANSFORMER');

export class TransformerService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Process scraped data from CSV file and import to database
   */
  async processScrapedData(
    csvFilePath: string,
    tenantId: string,
    userId: string
  ): Promise<{ imported: number; updated: number; skipped: number }> {
    try {
      // Read and parse CSV
      const csvContent = readFileSync(csvFilePath, 'utf-8');
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      let imported = 0;
      let updated = 0;
      let skipped = 0;

      for (const record of records) {
        try {
          // Handle both simple and extended CSV formats
          const scrapedTender: ScrapedTender = {
            id: record.id,
            title: record.title_en || record.title, // Use English title if available
            status: record.status_en || record.status, // Use English status if available
            days_left: record.days_left,
            value: record.value_usd || record.value, // Prefer USD value if available
            url: record.url
          };

          // Transform tender data
          const transformedTender = await this.transformTender(scrapedTender, record);
          
          // Check if tender already exists with multiple criteria
          const existingTender = await this.findExistingTender(
            tenantId,
            transformedTender
          );

          if (existingTender) {
            // Check if data has changed
            if (this.hasDataChanged(existingTender, transformedTender)) {
              await this.updateTender(existingTender.id, transformedTender);
              updated++;
            } else {
              skipped++;
            }
          } else {
            // Create new tender
            await this.createTender(tenantId, userId, transformedTender);
            imported++;
          }

        } catch (error) {
          logError('PROCESSING', `Failed to process tender ${record.id}`, error as Error);
          skipped++;
        }
      }

      return { imported, updated, skipped };

    } catch (error) {
      logError('PROCESSING', 'Failed to process scraped data', error as Error);
      throw new Error(`Data processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Transform scraped tender data to TenderFlow format
   */
  private async transformTender(scraped: ScrapedTender, fullRecord?: any): Promise<TransformedTender> {
    // Parse value and convert currency
    const { amount, currency, exchangeRates } = await this.parseAndConvertValue(scraped.value);
    
    // Calculate deadline from days_left
    const deadline = this.calculateDeadline(scraped.days_left);
    
    // Map status
    const status = this.mapStatus(scraped.status);
    
    // Use category from full record if available, otherwise determine from title
    const category = fullRecord?.category ? 
      this.mapCategoryString(fullRecord.category) : 
      this.categorizeByTitle(scraped.title);

    // Handle text encoding and prepare for translation
    const { cleanTitle, translatedTitle } = await this.processTitle(scraped.title);

    return {
      externalId: scraped.id,
      title: translatedTitle || cleanTitle, // Use translated if available, otherwise cleaned
      originalTitle: fullRecord?.title || scraped.title, // Preserve original Russian/Kazakh title
      status,
      originalStatus: scraped.status,
      category,
      deadline: fullRecord?.deadline ? new Date(fullRecord.deadline) : deadline,
      estimatedValue: amount,
      currency,
      originalValue: fullRecord?.value || scraped.value,
      exchangeRates,
      sourcePortal: 'zakup.sk.kz',
      sourceUrl: scraped.url,
      scrapedAt: new Date(),
      metadata: {
        daysLeft: scraped.days_left,
        region: fullRecord?.region,
        originalData: { ...scraped, ...fullRecord }
      }
    };
  }

  /**
   * Parse value string and convert currency
   */
  private async parseAndConvertValue(valueStr: string): Promise<{
    amount: number;
    currency: string;
    exchangeRates?: any;
  }> {
    // Remove currency symbols and spaces, handle different number formats
    const cleanValue = valueStr
      .replace(/₸/g, '')
      .replace(/[^\d,.]/g, '') // Remove non-digit, non-comma, non-dot characters
      .replace(/\s+/g, '')
      .trim();

    // Handle different number formats (European vs US)
    let normalizedValue = cleanValue;
    if (cleanValue.includes(',') && cleanValue.includes('.')) {
      // Format like 1,234,567.89 (US) or 1.234.567,89 (European)
      const lastCommaIndex = cleanValue.lastIndexOf(',');
      const lastDotIndex = cleanValue.lastIndexOf('.');
      
      if (lastDotIndex > lastCommaIndex) {
        // US format: 1,234,567.89
        normalizedValue = cleanValue.replace(/,/g, '');
      } else {
        // European format: 1.234.567,89
        normalizedValue = cleanValue.replace(/\./g, '').replace(',', '.');
      }
    } else if (cleanValue.includes(',')) {
      // Could be European decimal separator
      const parts = cleanValue.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        // Decimal separator: 1234,56
        normalizedValue = cleanValue.replace(',', '.');
      } else {
        // Thousands separator: 1,234,567
        normalizedValue = cleanValue.replace(/,/g, '');
      }
    }

    const amount = parseFloat(normalizedValue) || 0;

    if (valueStr.includes('₸')) {
      // Get real-time exchange rate (fallback to approximate)
      const kztToUsdRate = await this.getExchangeRate('KZT', 'USD');
      const usdAmount = amount * kztToUsdRate;

      return {
        amount: Math.round(usdAmount * 100) / 100,
        currency: 'USD',
        exchangeRates: {
          from: 'KZT',
          to: 'USD',
          rate: kztToUsdRate,
          originalAmount: amount,
          timestamp: new Date(),
          source: 'api' // or 'fallback'
        }
      };
    }

    return {
      amount,
      currency: 'USD'
    };
  }

  /**
   * Get exchange rate from external API with fallback
   */
  private async getExchangeRate(from: string, to: string): Promise<number> {
    try {
      // Try to get from free exchange rate API
      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`);
      const data = await response.json();
      
      if (data.rates && data.rates[to]) {
        return data.rates[to];
      }
    } catch (error) {
      logWarning('CURRENCY', `Failed to fetch exchange rate for ${from}/${to}`, error);
    }

    // Fallback rates (approximate)
    const fallbackRates: Record<string, Record<string, number>> = {
      KZT: { USD: 0.002, EUR: 0.0018 },
      USD: { KZT: 450, EUR: 0.85 },
      EUR: { KZT: 520, USD: 1.18 }
    };

    return fallbackRates[from]?.[to] || 1;
  }

  /**
   * Process title for proper encoding and translation
   */
  private async processTitle(title: string): Promise<{
    cleanTitle: string;
    translatedTitle?: string;
  }> {
    // Clean up encoding issues
    let cleanTitle = title
      .replace(/â€™/g, "'")  // Fix apostrophe encoding
      .replace(/â€œ/g, '"')  // Fix quote encoding
      .replace(/â€/g, '"')   // Fix quote encoding
      .replace(/Ã©/g, 'é')   // Fix accented characters
      .replace(/â€"/g, '–')  // Fix dash encoding
      .replace(/\u00A0/g, ' ') // Replace non-breaking spaces
      .trim();

    // Detect language
    const language = this.detectTitleLanguage(cleanTitle);
    
    // If not in English, attempt translation
    let translatedTitle: string | undefined;
    if (language !== 'en') {
      try {
        translatedTitle = await this.translateTitle(cleanTitle, language);
      } catch (error) {
        logWarning('TRANSLATION', 'Translation failed', error);
      }
    }

    return { cleanTitle, translatedTitle };
  }

  /**
   * Detect the language of the title
   */
  private detectTitleLanguage(title: string): string {
    const lowerTitle = title.toLowerCase();
    
    // Russian indicators
    const russianPatterns = [
      /[а-яё]/,  // Cyrillic characters
      /(услуг|работ|поставк|закуп|тендер|конкурс)/,
      /(строительство|ремонт|обслуживание)/
    ];
    
    // Kazakh indicators (uses Cyrillic but has specific patterns)
    const kazakhPatterns = [
      /(қызмет|жұмыс|жеткізу|сатып алу)/,
      /(құрылыс|жөндеу|қызмет көрсету)/
    ];
    
    // Check for Kazakh first (more specific)
    for (const pattern of kazakhPatterns) {
      if (pattern.test(lowerTitle)) {
        return 'kk';
      }
    }
    
    // Check for Russian
    for (const pattern of russianPatterns) {
      if (pattern.test(lowerTitle)) {
        return 'ru';
      }
    }
    
    // Default to English
    return 'en';
  }

  /**
   * Translate title to English (placeholder - would use real translation service)
   */
  private async translateTitle(title: string, fromLanguage: string): Promise<string | undefined> {
    // This is a placeholder implementation
    // In production, you would integrate with Google Translate, Azure Translator, or similar
    
    try {
      // For now, return undefined to indicate no translation
      // In production:
      // const response = await fetch('https://api.translate.service.com/translate', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     text: title,
      //     from: fromLanguage,
      //     to: 'en'
      //   })
      // });
      // const data = await response.json();
      // return data.translatedText;
      
      return undefined;
    } catch (error) {
      logError('TRANSLATION', 'Translation service error', error as Error);
      return undefined;
    }
  }

  /**
   * Calculate deadline from days left string
   */
  private calculateDeadline(daysLeftStr: string): Date | undefined {
    const match = daysLeftStr.match(/(\d+)/);
    if (match) {
      const days = parseInt(match[1]);
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + days);
      return deadline;
    }
    return undefined;
  }

  /**
   * Map tender status to TenderFlow enum
   */
  private mapStatus(originalStatus: string): TenderStatus {
    const statusMap: Record<string, TenderStatus> = {
      'Открытый тендер': 'SCRAPED',
      'Запрос ценовых предложений': 'SCRAPED',
      'Запрос ценовых предложений на понижение': 'SCRAPED',
      'Запрос ценовых предложений с ограниченным участием': 'SCRAPED',
      'Открытый тендер на понижение': 'SCRAPED',
    };

    return statusMap[originalStatus] || 'SCRAPED';
  }

  /**
   * Map category string to TenderCategory enum
   */
  private mapCategoryString(categoryStr: string): TenderCategory {
    const categoryMap: Record<string, TenderCategory> = {
      'CONSTRUCTION': 'CONSTRUCTION',
      'IT_SERVICES': 'IT_SERVICES',
      'CONSULTING': 'CONSULTING',
      'SUPPLIES': 'SUPPLIES',
      'MAINTENANCE': 'MAINTENANCE',
      'OTHER': 'OTHER'
    };
    
    return categoryMap[categoryStr.toUpperCase()] || 'OTHER';
  }

  /**
   * Categorize tender by title keywords (basic heuristic)
   */
  private categorizeByTitle(title: string): TenderCategory {
    const titleLower = title.toLowerCase();

    if (titleLower.includes('строител') || titleLower.includes('ремонт') || titleLower.includes('стро')) {
      return 'CONSTRUCTION';
    }
    
    if (titleLower.includes('компьютер') || titleLower.includes('программ') || titleLower.includes('it')) {
      return 'IT_SERVICES';
    }
    
    if (titleLower.includes('консульт') || titleLower.includes('услуг')) {
      return 'CONSULTING';
    }
    
    if (titleLower.includes('поставк') || titleLower.includes('закупк')) {
      return 'SUPPLIES';
    }
    
    if (titleLower.includes('обслуж') || titleLower.includes('содерж')) {
      return 'MAINTENANCE';
    }

    return 'OTHER';
  }

  /**
   * Find existing tender using multiple criteria
   */
  private async findExistingTender(
    tenantId: string,
    transformedTender: TransformedTender
  ): Promise<any> {
    // Primary match: external ID and source portal
    let existingTender = await this.prisma.tender.findFirst({
      where: {
        tenantId,
        sourcePortal: transformedTender.sourcePortal,
        externalId: transformedTender.externalId
      }
    });

    if (existingTender) {
      return existingTender;
    }

    // Secondary match: similar title and deadline (for cases where external ID might change)
    if (transformedTender.title && transformedTender.deadline) {
      existingTender = await this.prisma.tender.findFirst({
        where: {
          tenantId,
          sourcePortal: transformedTender.sourcePortal,
          title: {
            contains: transformedTender.title.substring(0, 50) // Match first 50 chars
          },
          deadline: {
            gte: new Date(transformedTender.deadline.getTime() - 24 * 60 * 60 * 1000), // 1 day before
            lte: new Date(transformedTender.deadline.getTime() + 24 * 60 * 60 * 1000)  // 1 day after
          }
        }
      });
    }

    return existingTender;
  }

  /**
   * Check if tender data has changed
   */
  private hasDataChanged(existing: any, transformed: TransformedTender): boolean {
    return (
      existing.title !== transformed.title ||
      existing.originalStatus !== transformed.originalStatus ||
      existing.estimatedValue?.toString() !== transformed.estimatedValue?.toString() ||
      existing.deadline?.getTime() !== transformed.deadline?.getTime()
    );
  }

  /**
   * Create new tender in database
   */
  private async createTender(
    tenantId: string,
    userId: string,
    tender: TransformedTender
  ): Promise<void> {
    await this.prisma.tender.create({
      data: {
        tenantId,
        createdBy: userId,
        externalId: tender.externalId,
        title: tender.title,
        status: tender.status,
        category: tender.category,
        publishedAt: new Date(),
        deadline: tender.deadline,
        estimatedValue: tender.estimatedValue,
        currency: tender.currency,
        source: tender.sourcePortal,
        metadata: tender.metadata,
        // Scraper-specific fields
        scrapedAt: tender.scrapedAt,
        sourcePortal: tender.sourcePortal,
        originalTitle: tender.originalTitle,
        originalStatus: tender.originalStatus,
        originalValue: tender.originalValue,
        exchangeRates: tender.exchangeRates,
        sourceUrl: tender.sourceUrl
      }
    });
  }

  /**
   * Update existing tender
   */
  private async updateTender(
    tenderId: string,
    tender: TransformedTender
  ): Promise<void> {
    await this.prisma.tender.update({
      where: { id: tenderId },
      data: {
        title: tender.title,
        status: tender.status,
        category: tender.category,
        deadline: tender.deadline,
        estimatedValue: tender.estimatedValue,
        currency: tender.currency,
        metadata: tender.metadata,
        // Update scraper fields
        scrapedAt: tender.scrapedAt,
        originalTitle: tender.originalTitle,
        originalStatus: tender.originalStatus,
        originalValue: tender.originalValue,
        exchangeRates: tender.exchangeRates,
        sourceUrl: tender.sourceUrl
      }
    });
  }

  /**
   * Get transformation statistics
   */
  async getTransformationStats(tenantId: string): Promise<any> {
    const totalTenders = await this.prisma.tender.count({
      where: { tenantId, sourcePortal: 'zakup.sk.kz' }
    });

    const categoryBreakdown = await this.prisma.tender.groupBy({
      by: ['category'],
      where: { tenantId, sourcePortal: 'zakup.sk.kz' },
      _count: true
    });

    const statusBreakdown = await this.prisma.tender.groupBy({
      by: ['status'],
      where: { tenantId, sourcePortal: 'zakup.sk.kz' },
      _count: true
    });

    const recentlyScraped = await this.prisma.tender.count({
      where: {
        tenantId,
        sourcePortal: 'zakup.sk.kz',
        scrapedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    });

    return {
      totalTenders,
      recentlyScraped,
      categoryBreakdown,
      statusBreakdown
    };
  }
}