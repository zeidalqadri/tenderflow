import { BaseExtractor, ExtractorContext, ExtractionResult, ExtractedData } from './base';

/**
 * Extractor for EU TED (Tenders Electronic Daily)
 * Handles receipt parsing from European tender submissions
 */
export class EuTedExtractor extends BaseExtractor {
  readonly type = 'eu-ted';
  readonly version = '1.0.0';
  readonly supportedMimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'];

  canHandle(context: ExtractorContext): boolean {
    const text = (context.ocrText || '').toLowerCase();
    const fileName = (context.fileMetadata?.originalName || '').toLowerCase();
    
    // Check for TED specific indicators
    const tedIndicators = [
      'ted.europa.eu',
      'tenders electronic daily',
      'supplement to the official journal',
      'european union',
      'directive 2014/24/eu',
      'directive 2014/25/eu',
      'cpv code',
      'nuts code',
      'ojeu',
      'ojs',
    ];
    
    const hasTedIndicator = tedIndicators.some(indicator => 
      text.includes(indicator) || fileName.includes(indicator)
    );
    
    // Check for EU-specific procurement patterns
    const euPatterns = [
      /notice\s+number[\s:]*\d{4}\/s[\s-]*\d{3}[\s-]*\d{6}/i,
      /cpv[\s:]*\d{8}[\s-]*\d/i,
      /nuts[\s:]*[a-z]{2}\d{3}/i,
      /contract\s+notice/i,
      /prior\s+information\s+notice/i,
      /contract\s+award\s+notice/i,
    ];
    
    const hasEuPattern = euPatterns.some(pattern => 
      pattern.test(text)
    );
    
    return hasTedIndicator || hasEuPattern;
  }

  async extract(context: ExtractorContext): Promise<ExtractionResult> {
    const startTime = Date.now();
    const text = context.ocrText || '';
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      const data: ExtractedData = {
        metadata: {
          portal: 'ted.europa.eu',
          region: 'EU',
          language: this.detectLanguage(text),
        },
      };

      // Extract TED-specific data
      this.extractNoticeInfo(text, data);
      this.extractTenderInfo(text, data);
      this.extractContractingAuthority(text, data);
      this.extractAmountInfo(text, data);
      this.extractDates(text, data);
      this.extractProcedureType(text, data);
      this.extractCodes(text, data);
      
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
    const languagePatterns = [
      { lang: 'en', words: ['contract', 'tender', 'authority', 'notice', 'procedure'] },
      { lang: 'de', words: ['vertrag', 'ausschreibung', 'behörde', 'bekanntmachung'] },
      { lang: 'fr', words: ['contrat', 'appel', 'autorité', 'avis', 'procédure'] },
      { lang: 'es', words: ['contrato', 'licitación', 'autoridad', 'anuncio'] },
      { lang: 'it', words: ['contratto', 'gara', 'autorità', 'bando'] },
    ];
    
    const lowerText = text.toLowerCase();
    let maxScore = 0;
    let detectedLang = 'en';
    
    for (const { lang, words } of languagePatterns) {
      const score = words.filter(word => lowerText.includes(word)).length;
      if (score > maxScore) {
        maxScore = score;
        detectedLang = lang;
      }
    }
    
    return detectedLang;
  }

  private extractNoticeInfo(text: string, data: ExtractedData): void {
    // Extract notice number (TED format: 2023/S 123-456789)
    const noticePattern = /notice\s+number[\s:]*(\d{4}\/s[\s-]*\d{3}[\s-]*\d{6})/i;
    const noticeMatch = text.match(noticePattern);
    if (noticeMatch) {
      data.submissionRef = noticeMatch[1].replace(/\s+/g, '');
      data.portalId = `ted-${data.submissionRef}`;
    }
    
    // Alternative pattern for notice references
    const altNoticePattern = /(\d{4}\/s[\s-]*\d{3}[\s-]*\d{6})/i;
    if (!data.submissionRef) {
      const altMatch = text.match(altNoticePattern);
      if (altMatch) {
        data.submissionRef = altMatch[1].replace(/\s+/g, '');
        data.portalId = `ted-${data.submissionRef}`;
      }
    }
  }

  private extractTenderInfo(text: string, data: ExtractedData): void {
    if (!data.tender) data.tender = {};
    
    // Extract contract title
    const titlePatterns = [
      /title[\s:]*([^\n]{10,200})/i,
      /contract\s+title[\s:]*([^\n]{10,200})/i,
      /description[\s:]*([^\n]{10,200})/i,
    ];
    
    for (const pattern of titlePatterns) {
      const match = text.match(pattern);
      if (match) {
        data.tender.title = match[1].trim().replace(/[;,.]$/, '');
        break;
      }
    }
    
    // Extract short description
    const descPatterns = [
      /short\s+description[\s:]*([^\n]{20,300})/i,
      /main\s+activities[\s:]*([^\n]{20,300})/i,
    ];
    
    for (const pattern of descPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.tender.description = match[1].trim();
        break;
      }
    }
    
    // Extract reference number
    const refPatterns = [
      /reference\s+number[\s:]*([^\n\s]{5,50})/i,
      /file\s+reference[\s:]*([^\n\s]{5,50})/i,
    ];
    
    for (const pattern of refPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.tender.reference = match[1].trim();
        break;
      }
    }
  }

  private extractContractingAuthority(text: string, data: ExtractedData): void {
    if (!data.bidder) data.bidder = {};
    
    // In TED context, bidder info often refers to contracting authority
    const authorityPatterns = [
      /contracting\s+authority[\s:]*([^\n]{10,150})/i,
      /official\s+name[\s:]*([^\n]{10,150})/i,
      /organisation[\s:]*([^\n]{10,150})/i,
    ];
    
    for (const pattern of authorityPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.bidder.name = match[1].trim().replace(/[;,.]$/, '');
        break;
      }
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
    
    // Extract registration number (VAT, etc.)
    const regPatterns = [
      /vat[\s:]*([a-z]{2}\d{8,15})/i,
      /registration[\s:]*(\d{6,15})/i,
      /tax[\s:]*(\d{6,15})/i,
    ];
    
    for (const pattern of regPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.bidder.identifier = match[1];
        break;
      }
    }
  }

  private extractAmountInfo(text: string, data: ExtractedData): void {
    // Common amount patterns for EU tenders
    const amountPatterns = [
      /estimated\s+value[\s:]*([0-9,.\s]+)\s*(EUR|USD|GBP|€|\$|£)/i,
      /total\s+value[\s:]*([0-9,.\s]+)\s*(EUR|USD|GBP|€|\$|£)/i,
      /contract\s+value[\s:]*([0-9,.\s]+)\s*(EUR|USD|GBP|€|\$|£)/i,
      /value[\s:]*([0-9,.\s]+)\s*(EUR|USD|GBP|€|\$|£)/i,
    ];
    
    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        const parsed = this.parseAmount(`${match[1]} ${match[2]}`);
        if (parsed.amount) {
          data.amount = parsed.amount;
          data.currency = parsed.currency || 'EUR';
          break;
        }
      }
    }
  }

  private extractDates(text: string, data: ExtractedData): void {
    // Extract deadline for receipt of tenders
    const deadlinePatterns = [
      /deadline\s+for\s+receipt\s+of\s+tenders[\s:]*([^\n]{8,30})/i,
      /time\s+limit\s+for\s+receipt[\s:]*([^\n]{8,30})/i,
      /closing\s+date[\s:]*([^\n]{8,30})/i,
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
    
    // Extract publication date
    const pubPatterns = [
      /date\s+of\s+dispatch[\s:]*([^\n]{8,30})/i,
      /publication\s+date[\s:]*([^\n]{8,30})/i,
      /sent\s+on[\s:]*([^\n]{8,30})/i,
    ];
    
    for (const pattern of pubPatterns) {
      const match = text.match(pattern);
      if (match) {
        const date = this.parseDate(match[1]);
        if (date) {
          data.timestamp = date;
          break;
        }
      }
    }
  }

  private extractProcedureType(text: string, data: ExtractedData): void {
    const procedurePatterns = [
      /type\s+of\s+procedure[\s:]*([^\n]{5,50})/i,
      /procedure[\s:]*([^\n]{5,50})/i,
    ];
    
    for (const pattern of procedurePatterns) {
      const match = text.match(pattern);
      if (match) {
        const procedure = match[1].trim().toLowerCase();
        if (!data.metadata) data.metadata = {};
        data.metadata.procedureType = procedure;
        
        // Map to status
        if (procedure.includes('open')) {
          data.status = 'open';
        } else if (procedure.includes('restricted')) {
          data.status = 'restricted';
        } else if (procedure.includes('negotiated')) {
          data.status = 'negotiated';
        }
        break;
      }
    }
  }

  private extractCodes(text: string, data: ExtractedData): void {
    if (!data.metadata) data.metadata = {};
    
    // Extract CPV codes (Common Procurement Vocabulary)
    const cpvPattern = /cpv[\s:]*(\d{8}[\s-]*\d)/gi;
    const cpvMatches = Array.from(text.matchAll(cpvPattern));
    if (cpvMatches.length > 0) {
      data.metadata.cpvCodes = cpvMatches.map(match => 
        match[1].replace(/[\s-]/g, '')
      );
      
      // Use first CPV code to determine category
      const firstCpv = data.metadata.cpvCodes[0];
      if (firstCpv) {
        data.tender = data.tender || {};
        data.tender.category = this.mapCpvToCategory(firstCpv);
      }
    }
    
    // Extract NUTS codes (Nomenclature of Territorial Units for Statistics)
    const nutsPattern = /nuts[\s:]*([a-z]{2}\d{1,3})/gi;
    const nutsMatches = Array.from(text.matchAll(nutsPattern));
    if (nutsMatches.length > 0) {
      data.metadata.nutsCodes = nutsMatches.map(match => 
        match[1].toUpperCase()
      );
    }
  }

  private mapCpvToCategory(cpvCode: string): string {
    const code = parseInt(cpvCode.substring(0, 2));
    
    const categoryMap: { [key: string]: string } = {
      '03': 'Agriculture',
      '09': 'Petroleum products',
      '14': 'Mining',
      '15': 'Food products',
      '16': 'Agricultural machinery',
      '18': 'Clothing',
      '19': 'Leather products',
      '22': 'Printed matter',
      '24': 'Chemical products',
      '30': 'Office equipment',
      '31': 'Electrical machinery',
      '32': 'Radio equipment',
      '33': 'Medical equipment',
      '34': 'Transport equipment',
      '35': 'Security equipment',
      '37': 'Musical instruments',
      '38': 'Laboratory equipment',
      '39': 'Furniture',
      '41': 'Water',
      '42': 'Industrial machinery',
      '43': 'Mining machinery',
      '44': 'Construction materials',
      '45': 'Construction work',
      '48': 'Software',
      '50': 'Repair services',
      '51': 'Installation services',
      '55': 'Hotel services',
      '60': 'Transport services',
      '63': 'Supporting transport services',
      '64': 'Postal services',
      '65': 'Public utilities',
      '66': 'Financial services',
      '67': 'Financial services',
      '70': 'Real estate services',
      '71': 'Architectural services',
      '72': 'IT services',
      '73': 'Research services',
      '75': 'Administrative services',
      '76': 'Services related to energy',
      '77': 'Agricultural services',
      '79': 'Business services',
      '80': 'Education services',
      '85': 'Health services',
      '90': 'Sewage services',
      '92': 'Recreation services',
      '98': 'Other community services',
    };
    
    return categoryMap[code.toString().padStart(2, '0')] || 'Other';
  }

  private calculateConfidence(data: ExtractedData, text: string): number {
    let score = 0;
    const maxScore = 10;
    
    // Portal identification (2 points)
    if (text.toLowerCase().includes('ted.europa.eu') || 
        text.toLowerCase().includes('tenders electronic daily')) {
      score += 2;
    }
    
    // Notice number (2 points)
    if (data.submissionRef && data.submissionRef.match(/\d{4}\/s/i)) {
      score += 2;
    }
    
    // Amount information (2 points)
    if (data.amount && data.currency) score += 2;
    
    // Contracting authority (2 points)
    if (data.bidder?.name) score += 1;
    if (data.bidder?.identifier) score += 1;
    
    // Tender information (1 point)
    if (data.tender?.title) score += 1;
    
    // Codes (1 point)
    if (data.metadata?.cpvCodes || data.metadata?.nutsCodes) score += 1;
    
    return score / maxScore;
  }
}