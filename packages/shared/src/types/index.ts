// Shared TypeScript types for TenderFlow

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  PARTICIPANT = 'PARTICIPANT',
  VIEWER = 'VIEWER',
}

export interface Tender {
  id: string;
  title: string;
  description: string;
  budget?: number;
  deadline: Date;
  status: TenderStatus;
  createdBy: string;
  assignedTo?: string[];
  documents: TenderDocument[];
  participants: TenderParticipant[];
  createdAt: Date;
  updatedAt: Date;
}

export enum TenderStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  IN_PROGRESS = 'IN_PROGRESS',
  EVALUATION = 'EVALUATION',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface TenderDocument {
  id: string;
  tenderId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  extractedText?: string;
  ocrStatus: OCRStatus;
  uploadedBy: string;
  uploadedAt: Date;
}

export enum OCRStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface TenderParticipant {
  id: string;
  tenderId: string;
  userId: string;
  user: User;
  submissionStatus: SubmissionStatus;
  submittedAt?: Date;
  documents: TenderDocument[];
  notes?: string;
}

export enum SubmissionStatus {
  INVITED = 'INVITED',
  VIEWED = 'VIEWED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  DISQUALIFIED = 'DISQUALIFIED',
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface FileUploadResponse {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}