// Data Transformation Service
// Converts raw scraper data to frontend-friendly formats

import { TenderStatus, TenderCategory } from '@prisma/client'

interface ScraperTender {
  id: string
  title: string
  description?: string
  organization: string
  publishedDate: string | Date
  closingDate: string | Date
  value?: number
  currency?: string
  source: string
  sourceId?: string
  rawData?: any
  language?: 'ru' | 'kz' | 'en'
}

interface TransformedTender {
  id: string
  title: string
  description: string
  organization: string
  publishedDate: string
  deadline: string
  value: number
  currency: string
  status: TenderStatus
  category: TenderCategory
  priority: 'low' | 'medium' | 'high' | 'critical'
  tags: string[]
  source: string
  sourceUrl?: string
  aiScore?: number
  annotations?: number
  isNew?: boolean
}

export class DataTransformer {
  // Currency conversion rates (simplified - in production, use real-time rates)
  private static currencyRates: Record<string, number> = {
    KZT: 0.0022,  // KZT to USD
    USD: 1.0,
    EUR: 1.08,
    CAD: 0.74,
    GBP: 1.27,
    RUB: 0.011
  }

  /**
   * Transform raw scraper data to frontend format
   */
  static transformScraperTender(scraperData: ScraperTender): TransformedTender {
    const value = this.normalizeValue(scraperData.value, scraperData.currency)
    const priority = this.calculatePriority(value, scraperData.closingDate)
    const category = this.detectCategory(scraperData.title, scraperData.description)
    const tags = this.extractTags(scraperData.title, scraperData.description)
    
    return {
      id: scraperData.id,
      title: this.cleanTitle(scraperData.title),
      description: this.cleanDescription(scraperData.description || ''),
      organization: this.normalizeOrganization(scraperData.organization),
      publishedDate: this.formatDate(scraperData.publishedDate),
      deadline: this.formatDate(scraperData.closingDate),
      value,
      currency: 'USD', // Always convert to USD for consistency
      status: TenderStatus.SCRAPED,
      category,
      priority,
      tags,
      source: scraperData.source,
      sourceUrl: this.buildSourceUrl(scraperData.source, scraperData.sourceId),
      aiScore: this.calculateAIScore(scraperData),
      annotations: 0,
      isNew: this.isNewTender(scraperData.publishedDate)
    }
  }

  /**
   * Transform multiple tenders
   */
  static transformMany(scraperData: ScraperTender[]): TransformedTender[] {
    return scraperData.map(tender => this.transformScraperTender(tender))
  }

  /**
   * Clean and normalize title
   */
  private static cleanTitle(title: string): string {
    // Remove extra whitespace
    let cleaned = title.trim().replace(/\s+/g, ' ')
    
    // Capitalize first letter of each word (title case)
    cleaned = cleaned.replace(/\b\w/g, char => char.toUpperCase())
    
    // Remove common prefixes
    cleaned = cleaned.replace(/^(RFP|RFQ|ITB|EOI|LOI|RFI)[\s:-]+/i, '')
    
    // Limit length
    if (cleaned.length > 200) {
      cleaned = cleaned.substring(0, 197) + '...'
    }
    
    return cleaned
  }

  /**
   * Clean and format description
   */
  private static cleanDescription(description: string): string {
    if (!description) return 'No description available'
    
    // Remove HTML tags if present
    let cleaned = description.replace(/<[^>]*>/g, '')
    
    // Remove extra whitespace
    cleaned = cleaned.trim().replace(/\s+/g, ' ')
    
    // Limit length for preview
    if (cleaned.length > 500) {
      cleaned = cleaned.substring(0, 497) + '...'
    }
    
    return cleaned
  }

  /**
   * Normalize organization name
   */
  private static normalizeOrganization(org: string): string {
    // Remove common suffixes
    let normalized = org.trim()
      .replace(/\s+(LLC|Ltd|Inc|Corp|GmbH|AG|SA|Pty|Plc)\.?$/i, '')
    
    // Capitalize properly
    normalized = normalized.replace(/\b\w/g, char => char.toUpperCase())
    
    // Handle government organizations
    if (normalized.toLowerCase().includes('government') || 
        normalized.toLowerCase().includes('ministry') ||
        normalized.toLowerCase().includes('department')) {
      normalized = '🏛️ ' + normalized
    }
    
    return normalized
  }

  /**
   * Convert value to USD
   */
  private static normalizeValue(value?: number, currency?: string): number {
    if (!value || !currency) return 0
    
    const rate = this.currencyRates[currency.toUpperCase()] || 1
    return Math.round(value * rate)
  }

  /**
   * Calculate priority based on value and deadline
   */
  private static calculatePriority(
    value: number, 
    deadline: string | Date
  ): 'low' | 'medium' | 'high' | 'critical' {
    const daysUntilDeadline = this.daysUntil(deadline)
    const valueScore = value > 1000000 ? 3 : value > 500000 ? 2 : value > 100000 ? 1 : 0
    const urgencyScore = daysUntilDeadline < 7 ? 3 : daysUntilDeadline < 14 ? 2 : daysUntilDeadline < 30 ? 1 : 0
    
    const totalScore = valueScore + urgencyScore
    
    if (totalScore >= 5) return 'critical'
    if (totalScore >= 3) return 'high'
    if (totalScore >= 1) return 'medium'
    return 'low'
  }

  /**
   * Detect category from title and description
   */
  private static detectCategory(title: string, description?: string): TenderCategory {
    const text = (title + ' ' + (description || '')).toLowerCase()
    
    const categoryKeywords = {
      [TenderCategory.IT_SERVICES]: ['software', 'cloud', 'it', 'digital', 'system', 'application', 'database', 'network'],
      [TenderCategory.CONSTRUCTION]: ['construction', 'building', 'infrastructure', 'renovation', 'repair'],
      [TenderCategory.CONSULTING]: ['consulting', 'advisory', 'audit', 'assessment', 'evaluation', 'study'],
      [TenderCategory.SUPPLIES]: ['supply', 'equipment', 'materials', 'purchase', 'procurement'],
      [TenderCategory.MAINTENANCE]: ['maintenance', 'support', 'service', 'repair'],
      [TenderCategory.RESEARCH]: ['research', 'study', 'analysis', 'survey', 'investigation'],
      [TenderCategory.TRAINING]: ['training', 'education', 'workshop', 'seminar', 'course']
    }
    
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return category as TenderCategory
      }
    }
    
    return TenderCategory.OTHER
  }

  /**
   * Extract relevant tags from tender content
   */
  private static extractTags(title: string, description?: string): string[] {
    const text = (title + ' ' + (description || '')).toLowerCase()
    const tags: string[] = []
    
    // Technology tags
    if (text.includes('cloud')) tags.push('Cloud Computing')
    if (text.includes('ai') || text.includes('artificial intelligence')) tags.push('AI/ML')
    if (text.includes('security') || text.includes('cyber')) tags.push('Cybersecurity')
    if (text.includes('data')) tags.push('Data Management')
    
    // Sector tags
    if (text.includes('government')) tags.push('Government')
    if (text.includes('health')) tags.push('Healthcare')
    if (text.includes('finance') || text.includes('banking')) tags.push('Financial')
    if (text.includes('education')) tags.push('Education')
    
    // Priority tags
    if (text.includes('urgent')) tags.push('Urgent')
    if (text.includes('emergency')) tags.push('Emergency')
    
    return tags.slice(0, 5) // Limit to 5 tags
  }

  /**
   * Build source URL from source type and ID
   */
  private static buildSourceUrl(source: string, sourceId?: string): string | undefined {
    if (!sourceId) return undefined
    
    const sourceUrls: Record<string, string> = {
      'zakup.sk.kz': `https://zakup.sk.kz/tender/${sourceId}`,
      'goszakup.gov.kz': `https://goszakup.gov.kz/ru/announce/index/${sourceId}`,
      'buyandsell.gc.ca': `https://buyandsell.gc.ca/procurement-data/tender-notice/${sourceId}`,
      'ted.europa.eu': `https://ted.europa.eu/notice/${sourceId}`
    }
    
    return sourceUrls[source.toLowerCase()]
  }

  /**
   * Calculate AI score based on various factors
   */
  private static calculateAIScore(tender: ScraperTender): number {
    let score = 50 // Base score
    
    // Value factor
    if (tender.value && tender.value > 1000000) score += 20
    else if (tender.value && tender.value > 500000) score += 15
    else if (tender.value && tender.value > 100000) score += 10
    
    // Description quality
    if (tender.description && tender.description.length > 500) score += 10
    else if (tender.description && tender.description.length > 200) score += 5
    
    // Deadline factor
    const daysUntilDeadline = this.daysUntil(tender.closingDate)
    if (daysUntilDeadline > 30) score += 10
    else if (daysUntilDeadline > 14) score += 5
    else if (daysUntilDeadline < 7) score -= 10
    
    // Cap between 0-100
    return Math.max(0, Math.min(100, score))
  }

  /**
   * Check if tender is new (published within last 24 hours)
   */
  private static isNewTender(publishedDate: string | Date): boolean {
    const published = new Date(publishedDate)
    const now = new Date()
    const hoursDiff = (now.getTime() - published.getTime()) / (1000 * 60 * 60)
    return hoursDiff <= 24
  }

  /**
   * Format date to ISO string
   */
  private static formatDate(date: string | Date): string {
    return new Date(date).toISOString()
  }

  /**
   * Calculate days until date
   */
  private static daysUntil(date: string | Date): number {
    const target = new Date(date)
    const now = new Date()
    const diff = target.getTime() - now.getTime()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  /**
   * Transform tender for real-time update
   */
  static transformRealtimeUpdate(tender: any): Partial<TransformedTender> {
    return {
      id: tender.id,
      status: tender.status,
      priority: tender.priority || this.calculatePriority(tender.value, tender.closingDate),
      isNew: true
    }
  }

  /**
   * Transform tender statistics for analytics
   */
  static transformStatistics(tenders: any[]): any {
    const stats = {
      total: tenders.length,
      newToday: 0,
      pendingReview: 0,
      highPriority: 0,
      totalValue: 0,
      byCategory: {} as Record<string, number>,
      byStatus: {} as Record<string, number>
    }
    
    const today = new Date().toDateString()
    
    tenders.forEach(tender => {
      // Count new tenders
      if (new Date(tender.publishedDate).toDateString() === today) {
        stats.newToday++
      }
      
      // Count by status
      if (tender.status === TenderStatus.SCRAPED) {
        stats.pendingReview++
      }
      stats.byStatus[tender.status] = (stats.byStatus[tender.status] || 0) + 1
      
      // Count high priority
      if (tender.priority === 'high' || tender.priority === 'critical') {
        stats.highPriority++
      }
      
      // Sum value
      stats.totalValue += tender.value || 0
      
      // Count by category
      stats.byCategory[tender.category] = (stats.byCategory[tender.category] || 0) + 1
    })
    
    return stats
  }
}

export default DataTransformer