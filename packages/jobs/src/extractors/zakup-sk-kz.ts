import { BaseExtractor, ExtractorContext, ExtractionResult, ExtractedData } from './base';

/**
 * Extractor for zakup.sk.kz (Kazakhstan Government Procurement Portal)
 * Handles receipt parsing from Kazakhstan procurement submissions
 */
export class ZakupSkKzExtractor extends BaseExtractor {
  readonly type = 'zakup-sk-kz';
  readonly version = '1.0.0';
  readonly supportedMimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'];

  canHandle(context: ExtractorContext): boolean {
    const text = (context.ocrText || '').toLowerCase();
    const fileName = (context.fileMetadata?.originalName || '').toLowerCase();
    
    // Check for zakup.sk.kz specific indicators
    const zakupIndicators = [
      'zakup.sk.kz',
      'goszakup',
      'государственные закупки',
      'мемлекеттік сатып алулар',
      'республика казахстан',
      'қазақстан республикасы',
      'procurement portal',
      'портал государственных закупок',
    ];
    
    const hasZakupIndicator = zakupIndicators.some(indicator => 
      text.includes(indicator) || fileName.includes(indicator)
    );
    
    // Check for common procurement document patterns
    const procurementPatterns = [
      /лот\s*№?\s*\d+/i,
      /tender\s*№?\s*\d+/i,
      /заявка\s*№?\s*\d+/i,
      /конкурс\s*№?\s*\d+/i,
      /договор\s*№?\s*[\w\d-]+/i,
    ];
    
    const hasProcurementPattern = procurementPatterns.some(pattern => 
      pattern.test(text)
    );
    
    return hasZakupIndicator || hasProcurementPattern;
  }

  async extract(context: ExtractorContext): Promise<ExtractionResult> {
    const startTime = Date.now();
    const text = context.ocrText || '';
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      const data: ExtractedData = {
        metadata: {
          portal: 'zakup.sk.kz',
          country: 'KZ',
          language: this.detectLanguage(text),
        },
      };

      // Extract portal-specific data
      this.extractSubmissionRef(text, data);
      this.extractTenderInfo(text, data);
      this.extractBidderInfo(text, data);
      this.extractAmountInfo(text, data);
      this.extractDates(text, data);
      this.extractStatus(text, data);
      
      // Calculate confidence based on extracted fields
      const confidence = this.calculateConfidence(data, text);
      
      // Validate extracted data
      const validation = this.validateData(data);
      if (!validation.isValid) {
        errors.push(...validation.errors);
      }
      
      return {
        success: true,
        confidence,
        data,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        extractorType: this.type,
        extractorVersion: this.version,
        processingTime: Date.now() - startTime,
      };
      
    } catch (error) {
      return {
        success: false,
        confidence: 0,
        errors: [error instanceof Error ? error.message : 'Extraction failed'],
        extractorType: this.type,
        extractorVersion: this.version,
        processingTime: Date.now() - startTime,
      };
    }
  }

  private detectLanguage(text: string): string {
    const kazakhWords = ['қазақстан', 'мемлекеттік', 'сатып', 'алулар', 'тенге'];
    const russianWords = ['казахстан', 'государственные', 'закупки', 'рублей', 'тенге'];
    const englishWords = ['kazakhstan', 'procurement', 'tender', 'contract', 'bid'];
    
    const lowerText = text.toLowerCase();
    
    const kazakhScore = kazakhWords.filter(word => lowerText.includes(word)).length;
    const russianScore = russianWords.filter(word => lowerText.includes(word)).length;
    const englishScore = englishWords.filter(word => lowerText.includes(word)).length;
    
    if (kazakhScore > russianScore && kazakhScore > englishScore) return 'kk';
    if (russianScore > englishScore) return 'ru';
    return 'en';
  }

  private extractSubmissionRef(text: string, data: ExtractedData): void {
    // Common patterns for submission references in Kazakhstan
    const patterns = [
      /(?:заявка|application|өтініш)\s*№?\s*([\w\d-]+)/i,
      /(?:лот|lot|лот)\s*№?\s*([\w\d-]+)/i,
      /(?:tender|тендер|конкурс)\s*№?\s*([\w\d-]+)/i,
      /(?:договор|contract|шарт)\s*№?\s*([\w\d-]+)/i,
      /№\s*([\w\d-]{6,})/i, // Generic number pattern
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        data.submissionRef = match[1].trim();
        data.portalId = `zakup-sk-kz-${match[1].trim()}`;
        break;
      }
    }
  }

  private extractTenderInfo(text: string, data: ExtractedData): void {
    if (!data.tender) data.tender = {};
    
    // Extract tender title
    const titlePatterns = [
      /(?:наименование|название|title|тақырыбы)[\s:]*([^\n]{20,150})/i,
      /(?:предмет|subject|мәні)[\s:]*([^\n]{20,150})/i,
    ];
    
    for (const pattern of titlePatterns) {
      const match = text.match(pattern);
      if (match) {
        data.tender.title = match[1].trim().replace(/[;,.]$/, '');
        break;
      }
    }
    
    // Extract tender reference
    const refPatterns = [
      /(?:объявление|announcement|хабарлама)\s*№?\s*([\w\d-]+)/i,
      /(?:конкурс|competition|байқау)\s*№?\s*([\w\d-]+)/i,
    ];
    
    for (const pattern of refPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.tender.reference = match[1].trim();
        break;
      }
    }
    
    // Extract category
    const categoryPatterns = [
      /(?:категория|category|санат)[\s:]*([^\n]{5,50})/i,
      /(?:вид|type|түрі)[\s:]*([^\n]{5,50})/i,
    ];
    
    for (const pattern of categoryPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.tender.category = match[1].trim();
        break;
      }
    }
  }

  private extractBidderInfo(text: string, data: ExtractedData): void {
    if (!data.bidder) data.bidder = {};
    
    // Extract company name
    const namePatterns = [
      /(?:организация|organization|ұйым)[\s:]*([^\n]{5,100})/i,
      /(?:поставщик|supplier|жеткізуші)[\s:]*([^\n]{5,100})/i,
      /(?:участник|participant|қатысушы)[\s:]*([^\n]{5,100})/i,
      /(?:ТОО|АО|ИП|LLC|LLP|JSC)\s+([^\n]{5,80})/i,
    ];
    
    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match) {
        data.bidder.name = match[1].trim().replace(/[;,.]$/, '');
        break;
      }
    }
    
    // Extract BIN/IIN (Business Identification Number)
    const binPattern = /(?:БИН|BIN|ЖСН|IIN|РНН)[\s:]*(\d{12})/i;
    const binMatch = text.match(binPattern);
    if (binMatch) {
      data.bidder.identifier = binMatch[1];
    }
    
    // Extract contact information
    const emails = this.extractEmails(text);
    const phones = this.extractPhones(text);
    
    if (emails.length > 0 || phones.length > 0) {
      data.bidder.contact = JSON.stringify({
        emails,
        phones,
      });
    }
  }

  private extractAmountInfo(text: string, data: ExtractedData): void {
    // Common amount patterns for Kazakhstan
    const amountPatterns = [
      /(?:сумма|amount|сома)[\s:]*([0-9,.\s]+)\s*(тенге|KZT|₸)/i,
      /(?:стоимость|cost|құны)[\s:]*([0-9,.\s]+)\s*(тенге|KZT|₸)/i,
      /(?:цена|price|баға)[\s:]*([0-9,.\s]+)\s*(тенге|KZT|₸)/i,
      /([0-9,.\s]+)\s*(тенге|KZT|₸)/i,
    ];
    
    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        const parsed = this.parseAmount(`${match[1]} ${match[2]}`);
        if (parsed.amount) {
          data.amount = parsed.amount;
          data.currency = parsed.currency || 'KZT';
          break;
        }
      }
    }
  }

  private extractDates(text: string, data: ExtractedData): void {
    // Extract submission timestamp
    const timestampPatterns = [
      /(?:дата\s+подачи|submission\s+date|өтініш\s+беру\s+күні)[\s:]*([^\n]{8,20})/i,
      /(?:подано|submitted|берілді)[\s:]*([^\n]{8,20})/i,
    ];
    
    for (const pattern of timestampPatterns) {
      const match = text.match(pattern);
      if (match) {
        const date = this.parseDate(match[1]);
        if (date) {
          data.timestamp = date;
          break;
        }
      }
    }
    
    // Extract deadline
    const deadlinePatterns = [
      /(?:срок\s+подачи|deadline|өтініш\s+беру\s+мерзімі)[\s:]*([^\n]{8,20})/i,
      /(?:до|until|дейін)[\s:]*([^\n]{8,20})/i,
    ];
    
    for (const pattern of deadlinePatterns) {
      const match = text.match(pattern);
      if (match) {
        const date = this.parseDate(match[1]);
        if (date) {
          data.deadline = date;
          if (!data.tender) data.tender = {};
          data.tender.deadline = date;
          break;
        }
      }
    }
  }

  private extractStatus(text: string, data: ExtractedData): void {
    const statusPatterns = [
      /(?:статус|status|күй)[\s:]*([^\n]{3,30})/i,
      /(?:принято|accepted|қабылданды)/i,
      /(?:отклонено|rejected|қабылданбады)/i,
      /(?:на\s+рассмотрении|under\s+review|қарау\s+үстінде)/i,
    ];
    
    for (const pattern of statusPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.status = match[0].toLowerCase();
        break;
      }
    }
  }

  private calculateConfidence(data: ExtractedData, text: string): number {
    let score = 0;
    const maxScore = 10;
    
    // Portal identification (2 points)
    if (text.toLowerCase().includes('zakup.sk.kz') || 
        text.toLowerCase().includes('goszakup')) {
      score += 2;
    }
    
    // Submission reference (2 points)
    if (data.submissionRef) score += 2;
    
    // Amount information (2 points)
    if (data.amount && data.currency) score += 2;
    
    // Bidder information (2 points)
    if (data.bidder?.name) score += 1;
    if (data.bidder?.identifier) score += 1;
    
    // Tender information (1 point)
    if (data.tender?.title || data.tender?.reference) score += 1;
    
    // Date information (1 point)
    if (data.timestamp || data.deadline) score += 1;
    
    return score / maxScore;
  }
}