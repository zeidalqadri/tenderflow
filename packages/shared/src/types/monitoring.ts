/**
 * Shared monitoring types for TenderFlow system
 */

export type ComponentStatus = 'healthy' | 'warning' | 'error' | 'unknown';
export type AlertLevel = 'info' | 'warning' | 'error' | 'critical';
export type RemediationStatus = 'pending' | 'executing' | 'completed' | 'failed';

export interface SystemMetrics {
  cpu: number;
  memory: number;
  disk: number;
  network: {
    in: number;
    out: number;
  };
  timestamp: number;
}

export interface ComponentHealth {
  id: string;
  name: string;
  status: ComponentStatus;
  health: number;
  lastCheck: Date;
  metrics?: {
    requests?: number;
    errors?: number;
    latency?: number;
    throughput?: number;
    uptime?: number;
  };
  dependencies?: string[];
}

export interface SystemHealth {
  overall: ComponentStatus;
  uptime: number;
  lastCheck: Date;
  components: Record<string, ComponentHealth>;
}

export interface AlertEvent {
  id: string;
  level: AlertLevel;
  component: string;
  message: string;
  timestamp: Date;
  details?: any;
  resolved?: boolean;
  resolvedAt?: Date;
}

export interface ErrorPattern {
  id: string;
  component: string;
  message: string;
  count: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  pattern?: string;
  remediation?: RemediationAction;
}

export interface RemediationAction {
  id: string;
  name: string;
  description: string;
  component: string;
  type: 'restart' | 'scale' | 'clear_cache' | 'reset_connection' | 'rotate_credentials' | 'custom';
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
  status?: RemediationStatus;
  executedAt?: Date;
  executedBy?: string;
  result?: {
    success: boolean;
    message: string;
    details?: any;
  };
}

export interface MonitoringEvent {
  type: 'health:update' | 'component:update' | 'alert:new' | 'error:new' | 'metrics:update' | 'remediation:complete';
  data: any;
  timestamp: Date;
}

export interface MonitoringSocketEvents {
  // Incoming events (from server)
  'health:update': (health: SystemHealth) => void;
  'component:update': (component: ComponentHealth) => void;
  'alert:new': (alert: AlertEvent) => void;
  'error:new': (error: ErrorPattern) => void;
  'metrics:update': (metrics: SystemMetrics) => void;
  'remediation:complete': (result: RemediationAction) => void;
  
  // Outgoing events (to server)
  'monitoring:subscribe': () => void;
  'monitoring:unsubscribe': () => void;
  'monitoring:refresh:health': () => void;
  'monitoring:refresh:component': (componentId: string) => void;
  'monitoring:remediation:execute': (actionId: string) => void;
  'monitoring:control:restart': (componentId: string) => void;
  'monitoring:control:scale': (componentId: string, replicas: number) => void;
  'monitoring:control:clear_cache': () => void;
}

export interface MonitoringConfig {
  enabled: boolean;
  interval: number;
  thresholds: {
    cpu: number;
    memory: number;
    disk: number;
    errorRate: number;
    responseTime: number;
  };
  alerts: {
    enabled: boolean;
    channels: string[];
  };
  remediation: {
    autoExecute: boolean;
    confidenceThreshold: number;
  };
}