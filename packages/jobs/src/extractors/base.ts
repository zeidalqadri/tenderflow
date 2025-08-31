export interface ExtractedData {
  portalId?: string;
  submissionRef?: string;
  amount?: number;
  currency?: string;
  timestamp?: Date;
  deadline?: Date;
  status?: string;
  bidder?: {
    name?: string;
    identifier?: string;
    contact?: string;
  };
  tender?: {
    title?: string;
    reference?: string;
    description?: string;
    category?: string;
  };
  metadata?: Record<string, any>;
}

export interface ExtractionResult {
  success: boolean;
  confidence: number; // 0-1 scale
  data?: ExtractedData;
  errors?: string[];
  warnings?: string[];
  extractorType: string;
  extractorVersion: string;
  processingTime: number;
}

export interface ExtractorContext {
  ocrText?: string;
  ocrConfidence?: number;
  fileMetadata?: {
    mimeType?: string;
    size?: number;
    originalName?: string;
  };
  submissionMetadata?: Record<string, any>;
}

export abstract class BaseExtractor {
  abstract readonly type: string;
  abstract readonly version: string;
  abstract readonly supportedMimeTypes: string[];
  
  /**
   * Check if extractor can handle the given context
   */
  abstract canHandle(context: ExtractorContext): boolean;
  
  /**
   * Extract structured data from context
   */
  abstract extract(context: ExtractorContext): Promise<ExtractionResult>;
  
  /**
   * Validate extracted data
   */
  protected validateData(data: ExtractedData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Basic validation rules
    if (data.amount !== undefined && (data.amount < 0 || isNaN(data.amount))) {
      errors.push('Invalid amount value');
    }
    
    if (data.timestamp && isNaN(data.timestamp.getTime())) {
      errors.push('Invalid timestamp');
    }
    
    if (data.deadline && isNaN(data.deadline.getTime())) {
      errors.push('Invalid deadline');
    }
    
    if (data.currency && !/^[A-Z]{3}$/.test(data.currency)) {
      errors.push('Invalid currency code format');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }
  
  /**
   * Parse common date formats
   */
  protected parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    
    // Common date patterns
    const patterns = [
      /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/,  // DD.MM.YYYY or DD/MM/YYYY
      /(\d{2,4})[./-](\d{1,2})[./-](\d{1,2})/,  // YYYY.MM.DD or YYYY/MM/DD
      /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2,4})/i, // DD Mon YYYY
    ];
    
    for (const pattern of patterns) {
      const match = dateStr.match(pattern);
      if (match) {
        try {
          // Try different interpretations based on pattern
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            return date;
          }
        } catch {
          continue;
        }
      }
    }
    
    // Fallback to ISO parsing
    try {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }
  
  /**
   * Parse amount with currency
   */
  protected parseAmount(amountStr: string): { amount?: number; currency?: string } {
    if (!amountStr) return {};
    
    // Clean the string
    const cleaned = amountStr.replace(/\s+/g, ' ').trim();
    
    // Currency patterns
    const currencyPatterns = [
      { pattern: /(\d+[,.\s]*\d*)\s*(USD|\$)/i, currency: 'USD' },
      { pattern: /(\d+[,.\s]*\d*)\s*(EUR|€)/i, currency: 'EUR' },
      { pattern: /(\d+[,.\s]*\d*)\s*(KZT|тенге)/i, currency: 'KZT' },
      { pattern: /(\d+[,.\s]*\d*)\s*(RUB|руб|₽)/i, currency: 'RUB' },
    ];
    
    for (const { pattern, currency } of currencyPatterns) {
      const match = cleaned.match(pattern);
      if (match) {
        const amountStr = match[1].replace(/[,\s]/g, '');
        const amount = parseFloat(amountStr);
        if (!isNaN(amount)) {
          return { amount, currency };
        }
      }
    }
    
    // Try parsing just the number
    const numberMatch = cleaned.match(/(\d+[,.\s]*\d*)/);
    if (numberMatch) {
      const amountStr = numberMatch[1].replace(/[,\s]/g, '');
      const amount = parseFloat(amountStr);
      if (!isNaN(amount)) {
        return { amount };
      }
    }
    
    return {};
  }
  
  /**
   * Extract email addresses from text
   */
  protected extractEmails(text: string): string[] {
    const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const matches = text.matchAll(emailPattern);
    return Array.from(matches).map(match => match[1]);
  }
  
  /**
   * Extract phone numbers (various formats)
   */
  protected extractPhones(text: string): string[] {
    const phonePatterns = [
      /(?:\+7|8)[\s-]?(?:\([0-9]{3}\)|[0-9]{3})[\s-]?[0-9]{3}[\s-]?[0-9]{2}[\s-]?[0-9]{2}/g,
      /(?:\+1)[\s-]?[0-9]{3}[\s-]?[0-9]{3}[\s-]?[0-9]{4}/g,
      /(?:\+[0-9]{1,3})[\s-]?[0-9]{1,4}[\s-]?[0-9]{1,4}[\s-]?[0-9]{1,9}/g,
    ];
    
    const phones: string[] = [];
    for (const pattern of phonePatterns) {
      const matches = text.matchAll(pattern);
      phones.push(...Array.from(matches).map(match => match[0]));
    }
    
    return [...new Set(phones)]; // Remove duplicates
  }
  
  /**
   * Calculate text similarity (simple Levenshtein-based)
   */
  protected calculateSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    
    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;
    
    const matrix: number[][] = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
    
    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    
    const maxLen = Math.max(len1, len2);
    return (maxLen - matrix[len1][len2]) / maxLen;
  }
}