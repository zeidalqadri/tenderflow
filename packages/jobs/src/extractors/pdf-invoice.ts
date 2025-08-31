import { BaseExtractor, ExtractorContext, ExtractionResult, ExtractedData } from './base';
import pdfParse from 'pdf-parse';

/**
 * PDF invoice/receipt parser
 * Handles structured extraction from PDF documents
 */
export class PdfInvoiceExtractor extends BaseExtractor {
  readonly type = 'pdf-invoice';
  readonly version = '1.0.0';
  readonly supportedMimeTypes = ['application/pdf'];

  canHandle(context: ExtractorContext): boolean {
    const mimeType = context.fileMetadata?.mimeType || '';
    const fileName = (context.fileMetadata?.originalName || '').toLowerCase();
    
    // Must be PDF
    if (mimeType !== 'application/pdf') return false;
    
    // Check for invoice/receipt indicators in filename or OCR text
    const text = (context.ocrText || '').toLowerCase();
    const invoiceIndicators = [
      'invoice',
      'receipt',
      'bill',
      'payment',
      'transaction',
      'purchase',
      'order',
      'confirmation',
      'statement',
      'summary',
      'factura',
      'rechnung',
      'fattura',
      'facture',
      'квитанция',
      'счет',
      'фактура',
    ];
    
    return invoiceIndicators.some(indicator => 
      text.includes(indicator) || fileName.includes(indicator)
    );
  }

  async extract(context: ExtractorContext): Promise<ExtractionResult> {
    const startTime = Date.now();
    const text = context.ocrText || '';
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      const data: ExtractedData = {
        metadata: {
          extractorType: 'pdf-invoice',
          language: this.detectLanguage(text),
          fileType: 'pdf',
        },
      };

      // Extract structured document data
      this.extractDocumentInfo(text, data);
      this.extractVendorInfo(text, data);
      this.extractCustomerInfo(text, data);
      this.extractAmountInfo(text, data);
      this.extractItemInfo(text, data);
      this.extractDates(text, data);
      this.extractTaxInfo(text, data);
      this.extractPaymentInfo(text, data);
      
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
      { lang: 'en', words: ['invoice', 'receipt', 'total', 'amount', 'date', 'bill', 'payment'] },
      { lang: 'de', words: ['rechnung', 'beleg', 'gesamt', 'betrag', 'datum', 'zahlung'] },
      { lang: 'fr', words: ['facture', 'reçu', 'total', 'montant', 'date', 'paiement'] },
      { lang: 'es', words: ['factura', 'recibo', 'total', 'importe', 'fecha', 'pago'] },
      { lang: 'it', words: ['fattura', 'ricevuta', 'totale', 'importo', 'data', 'pagamento'] },
      { lang: 'ru', words: ['счет', 'квитанция', 'итого', 'сумма', 'дата', 'платеж'] },
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

  private extractDocumentInfo(text: string, data: ExtractedData): void {
    // Extract document type
    const docTypePatterns = [
      /(invoice|receipt|bill|statement|purchase\s+order|credit\s+note)/i,
      /(rechnung|beleg|auftrag)/i,
      /(facture|reçu|commande)/i,
      /(factura|recibo|pedido)/i,
      /(счет|квитанция|заказ)/i,
    ];
    
    for (const pattern of docTypePatterns) {
      const match = text.match(pattern);
      if (match) {
        if (!data.metadata) data.metadata = {};
        data.metadata.documentType = match[1].toLowerCase();
        break;
      }
    }
    
    // Extract document number
    const docNumberPatterns = [
      /(?:invoice|receipt|bill|document)\s+(?:number|no|#)[\s:]*([a-z0-9-]+)/i,
      /(?:rechnung|beleg)\s+(?:nummer|nr)[\s:]*([a-z0-9-]+)/i,
      /(?:facture|reçu)\s+(?:numéro|n°)[\s:]*([a-z0-9-]+)/i,
      /(?:factura|recibo)\s+(?:número|no)[\s:]*([a-z0-9-]+)/i,
      /(?:счет|квитанция)\s+(?:номер|№)[\s:]*([a-z0-9-]+)/i,
      /(?:reference|ref)[\s:]*([a-z0-9-]+)/i,
    ];
    
    for (const pattern of docNumberPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.submissionRef = match[1];
        data.portalId = `pdf-${match[1]}`;
        break;
      }
    }
  }

  private extractVendorInfo(text: string, data: ExtractedData): void {
    if (!data.bidder) data.bidder = {};
    
    // Extract vendor/supplier information
    const vendorPatterns = [
      /(?:from|vendor|supplier|seller|company)[\s:]*\n([^\n]{5,100})/i,
      /(?:von|lieferant|unternehmen)[\s:]*\n([^\n]{5,100})/i,
      /(?:de|fournisseur|société)[\s:]*\n([^\n]{5,100})/i,
      /(?:proveedor|empresa)[\s:]*\n([^\n]{5,100})/i,
      /(?:от|поставщик|компания)[\s:]*\n([^\n]{5,100})/i,
    ];
    
    for (const pattern of vendorPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.bidder.name = match[1].trim().replace(/[;,.]$/, '');
        break;
      }
    }
    
    // Look for company name in header (first few lines)
    const lines = text.split('\n').slice(0, 10);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 10 && 
          /[A-Z]/.test(trimmed) && 
          !/(invoice|receipt|bill|date|total)/i.test(trimmed)) {
        if (!data.bidder.name) {
          data.bidder.name = trimmed;
          break;
        }
      }
    }
    
    // Extract tax/registration numbers
    const taxPatterns = [
      /(?:tax|vat|gstin|tin)\s+(?:id|number|no)[\s:]*([a-z0-9-]+)/i,
      /(?:registration|reg)\s+(?:number|no)[\s:]*([a-z0-9-]+)/i,
      /(?:ustid|steuernummer)[\s:]*([a-z0-9-]+)/i,
      /(?:siret|siren|tva)[\s:]*([a-z0-9-]+)/i,
      /(?:nif|cif)[\s:]*([a-z0-9-]+)/i,
      /(?:инн|огрн)[\s:]*([0-9-]+)/i,
    ];
    
    for (const pattern of taxPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.bidder.identifier = match[1];
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
  }

  private extractCustomerInfo(text: string, data: ExtractedData): void {
    if (!data.metadata) data.metadata = {};
    
    // Extract customer/bill-to information
    const customerPatterns = [
      /(?:bill\s+to|sold\s+to|customer|client)[\s:]*\n([^\n]{5,100})/i,
      /(?:rechnung\s+an|kunde)[\s:]*\n([^\n]{5,100})/i,
      /(?:facturé\s+à|client)[\s:]*\n([^\n]{5,100})/i,
      /(?:facturar\s+a|cliente)[\s:]*\n([^\n]{5,100})/i,
      /(?:плательщик|клиент)[\s:]*\n([^\n]{5,100})/i,
    ];
    
    for (const pattern of customerPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.metadata.customer = match[1].trim();
        break;
      }
    }
  }

  private extractAmountInfo(text: string, data: ExtractedData): void {
    // Extract total amount
    const totalPatterns = [
      /(?:total|grand\s+total|amount\s+due|balance)[\s:]*([0-9,.\s]+)\s*(USD|EUR|GBP|\$|€|£|KZT|RUB|₽)/i,
      /(?:gesamt|gesamtbetrag)[\s:]*([0-9,.\s]+)\s*(USD|EUR|GBP|\$|€|£)/i,
      /(?:total|montant\s+total)[\s:]*([0-9,.\s]+)\s*(USD|EUR|GBP|\$|€|£)/i,
      /(?:total|importe\s+total)[\s:]*([0-9,.\s]+)\s*(USD|EUR|GBP|\$|€|£)/i,
      /(?:итого|общая\s+сумма)[\s:]*([0-9,.\s]+)\s*(USD|EUR|GBP|\$|€|£|RUB|₽)/i,
    ];
    
    for (const pattern of totalPatterns) {
      const match = text.match(pattern);
      if (match) {
        const parsed = this.parseAmount(`${match[1]} ${match[2]}`);
        if (parsed.amount) {
          data.amount = parsed.amount;
          data.currency = parsed.currency;
          break;
        }
      }
    }
    
    // If no total found, look for any amount
    if (!data.amount) {
      const amountPattern = /([0-9,.\s]+)\s*(USD|EUR|GBP|\$|€|£|KZT|RUB|₽)/i;
      const amounts = Array.from(text.matchAll(new RegExp(amountPattern, 'gi')));
      
      if (amounts.length > 0) {
        // Take the largest amount as likely total
        let maxAmount = 0;
        let maxCurrency = '';
        
        for (const match of amounts) {
          const parsed = this.parseAmount(`${match[1]} ${match[2]}`);
          if (parsed.amount && parsed.amount > maxAmount) {
            maxAmount = parsed.amount;
            maxCurrency = parsed.currency || '';
          }
        }
        
        if (maxAmount > 0) {
          data.amount = maxAmount;
          data.currency = maxCurrency;
        }
      }
    }
  }

  private extractItemInfo(text: string, data: ExtractedData): void {
    if (!data.metadata) data.metadata = {};
    
    // Look for itemized information
    const itemPatterns = [
      /(?:description|item|product|service)[\s:]*([^\n]{10,150})/i,
      /(?:beschreibung|artikel|produkt|dienstleistung)[\s:]*([^\n]{10,150})/i,
      /(?:description|article|produit|service)[\s:]*([^\n]{10,150})/i,
      /(?:descripción|artículo|producto|servicio)[\s:]*([^\n]{10,150})/i,
      /(?:описание|товар|услуга)[\s:]*([^\n]{10,150})/i,
    ];
    
    const items: string[] = [];
    
    for (const pattern of itemPatterns) {
      const matches = Array.from(text.matchAll(new RegExp(pattern, 'gi')));
      for (const match of matches) {
        items.push(match[1].trim());
      }
    }
    
    if (items.length > 0) {
      data.metadata.items = items;
      
      // Use first item as tender title if not already set
      if (!data.tender) data.tender = {};
      if (!data.tender.title && items[0].length >= 10) {
        data.tender.title = items[0];
      }
    }
  }

  private extractDates(text: string, data: ExtractedData): void {
    // Extract invoice/document date
    const datePatterns = [
      /(?:date|invoice\s+date|bill\s+date|issued)[\s:]*([^\n]{8,30})/i,
      /(?:datum|rechnungsdatum)[\s:]*([^\n]{8,30})/i,
      /(?:date|date\s+de\s+facture)[\s:]*([^\n]{8,30})/i,
      /(?:fecha|fecha\s+de\s+factura)[\s:]*([^\n]{8,30})/i,
      /(?:дата|дата\s+счета)[\s:]*([^\n]{8,30})/i,
    ];
    
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        const date = this.parseDate(match[1]);
        if (date) {
          data.timestamp = date;
          break;
        }
      }
    }
    
    // Extract due date
    const duePatterns = [
      /(?:due\s+date|payment\s+due|due\s+by)[\s:]*([^\n]{8,30})/i,
      /(?:fällig\s+am|zahlbar\s+bis)[\s:]*([^\n]{8,30})/i,
      /(?:échéance|à\s+payer\s+avant)[\s:]*([^\n]{8,30})/i,
      /(?:vencimiento|pagar\s+antes)[\s:]*([^\n]{8,30})/i,
      /(?:срок\s+оплаты|оплатить\s+до)[\s:]*([^\n]{8,30})/i,
    ];
    
    for (const pattern of duePatterns) {
      const match = text.match(pattern);
      if (match) {
        const date = this.parseDate(match[1]);
        if (date) {
          data.deadline = date;
          break;
        }
      }
    }
  }

  private extractTaxInfo(text: string, data: ExtractedData): void {
    if (!data.metadata) data.metadata = {};
    
    // Extract tax information
    const taxPatterns = [
      /(?:tax|vat|gst)[\s:]*([0-9,.\s]+)/i,
      /(?:steuer|mwst)[\s:]*([0-9,.\s]+)/i,
      /(?:taxe|tva)[\s:]*([0-9,.\s]+)/i,
      /(?:impuesto|iva)[\s:]*([0-9,.\s]+)/i,
      /(?:налог|ндс)[\s:]*([0-9,.\s]+)/i,
    ];
    
    for (const pattern of taxPatterns) {
      const match = text.match(pattern);
      if (match) {
        const amount = parseFloat(match[1].replace(/[,\s]/g, ''));
        if (!isNaN(amount)) {
          data.metadata.taxAmount = amount;
          break;
        }
      }
    }
  }

  private extractPaymentInfo(text: string, data: ExtractedData): void {
    if (!data.metadata) data.metadata = {};
    
    // Extract payment method
    const paymentPatterns = [
      /(?:payment\s+method|paid\s+by)[\s:]*([^\n]{5,50})/i,
      /(?:zahlungsart|bezahlt\s+mit)[\s:]*([^\n]{5,50})/i,
      /(?:mode\s+de\s+paiement|payé\s+par)[\s:]*([^\n]{5,50})/i,
      /(?:método\s+de\s+pago|pagado\s+con)[\s:]*([^\n]{5,50})/i,
      /(?:способ\s+оплаты|оплачено)[\s:]*([^\n]{5,50})/i,
    ];
    
    for (const pattern of paymentPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.metadata.paymentMethod = match[1].trim();
        break;
      }
    }
    
    // Look for payment status
    const statusPatterns = [
      /(?:paid|payment\s+received|settled)/i,
      /(?:bezahlt|zahlung\s+erhalten)/i,
      /(?:payé|paiement\s+reçu)/i,
      /(?:pagado|pago\s+recibido)/i,
      /(?:оплачено|платеж\s+получен)/i,
    ];
    
    for (const pattern of statusPatterns) {
      if (pattern.test(text)) {
        data.status = 'paid';
        break;
      }
    }
  }

  private calculateConfidence(data: ExtractedData, text: string): number {
    let score = 0;
    const maxScore = 10;
    
    // Document structure (2 points)
    if (data.metadata?.documentType) score += 1;
    if (data.submissionRef) score += 1;
    
    // Vendor information (3 points)
    if (data.bidder?.name) score += 2;
    if (data.bidder?.identifier) score += 1;
    
    // Amount information (3 points)
    if (data.amount && data.currency) score += 3;
    
    // Date information (2 points)
    if (data.timestamp) score += 1;
    if (data.deadline) score += 1;
    
    return score / maxScore;
  }
}