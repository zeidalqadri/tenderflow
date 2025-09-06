import { 
  useQuery, 
  useMutation, 
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions 
} from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3457';

// Types
export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface QueueHealth {
  status: 'healthy' | 'unhealthy';
  queues: Record<string, { status: string; stats?: QueueStats; error?: string }>;
  redis?: {
    status: 'healthy' | 'unhealthy';
    details?: string;
    stats?: any;
  };
}

export interface ScrapingOptions {
  sourcePortal: string;
  maxPages?: number;
  startDate?: string;
  endDate?: string;
  categories?: string[];
  forceRefresh?: boolean;
}

export interface ProcessingOptions {
  tenderId: string;
  action: 'validate' | 'categorize' | 'analyze' | 'notify';
  options?: Record<string, any>;
}

export interface NotificationOptions {
  userId?: string;
  type: 'tender_update' | 'deadline_reminder' | 'scraping_complete' | 'system_alert';
  data: Record<string, any>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface JobResponse {
  jobId: string;
  status: string;
  queue: string;
}

// Query Keys
export const queueKeys = {
  all: ['queues'] as const,
  stats: () => [...queueKeys.all, 'stats'] as const,
  health: () => [...queueKeys.all, 'health'] as const,
  queue: (name: string) => [...queueKeys.all, name] as const,
} as const;

// Helper function to get auth token
const getAuthHeaders = () => {
  const isDevMode = process.env.NEXT_PUBLIC_DISABLE_AUTH === 'true';
  let token = localStorage.getItem('token');
  
  // Use mock token in dev mode if no token exists
  if (isDevMode && !token) {
    token = 'dev-mock-token';
    localStorage.setItem('token', token);
  }
  
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
};

// Fetch queue statistics
export function useQueueStats(options?: UseQueryOptions<any>) {
  return useQuery({
    queryKey: queueKeys.stats(),
    queryFn: async () => {
      const response = await fetch(`${API_URL}/api/v1/queues/stats`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error('Failed to fetch queue stats');
      return response.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds
    ...options,
  });
}

// Monitor queue health
export function useQueueHealth(options?: UseQueryOptions<QueueHealth>) {
  return useQuery({
    queryKey: queueKeys.health(),
    queryFn: async () => {
      const response = await fetch(`${API_URL}/api/v1/queues/health`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error('Failed to fetch queue health');
      return response.json();
    },
    refetchInterval: 10000, // Refresh every 10 seconds
    ...options,
  });
}

// Get specific queue details
export function useQueueDetails(queueName: string, options?: UseQueryOptions<any>) {
  return useQuery({
    queryKey: queueKeys.queue(queueName),
    queryFn: async () => {
      const response = await fetch(`${API_URL}/api/v1/queues/${queueName}`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error(`Failed to fetch ${queueName} queue details`);
      return response.json();
    },
    enabled: !!queueName,
    ...options,
  });
}

// Trigger scraping job
export function useTriggerScraping() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (options: ScrapingOptions): Promise<JobResponse> => {
      const response = await fetch(`${API_URL}/api/v1/queues/trigger/scraping`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(options),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to trigger scraping');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queueKeys.stats() });
      toast({
        title: 'Scraping Started',
        description: `Job ${data.jobId} has been queued for processing`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Scraping Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Queue tender processing
export function useTriggerProcessing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (options: ProcessingOptions): Promise<JobResponse> => {
      const response = await fetch(`${API_URL}/api/v1/queues/trigger/processing`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(options),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to trigger processing');
      }
      
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queueKeys.stats() });
      toast({
        title: 'Processing Started',
        description: `Tender is being ${variables.action === 'validate' ? 'validated' : variables.action === 'categorize' ? 'categorized' : 'analyzed'}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Processing Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Trigger notification
export function useTriggerNotification() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (options: NotificationOptions): Promise<JobResponse> => {
      const response = await fetch(`${API_URL}/api/v1/queues/trigger/notification`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(options),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to trigger notification');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queueKeys.stats() });
      toast({
        title: 'Notification Queued',
        description: 'Notification will be sent shortly',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Notification Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Retry failed jobs in a queue
export function useRetryFailedJobs() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (queueName: string) => {
      const response = await fetch(`${API_URL}/api/v1/queues/${queueName}/retry`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to retry jobs');
      }
      
      return response.json();
    },
    onSuccess: (data, queueName) => {
      queryClient.invalidateQueries({ queryKey: queueKeys.all });
      toast({
        title: 'Jobs Retried',
        description: `${data.retriedJobs} failed jobs have been retried in ${queueName}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Retry Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Clean queue (remove old completed/failed jobs)
export function useCleanQueue() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (queueName: string) => {
      const response = await fetch(`${API_URL}/api/v1/queues/${queueName}/clean`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to clean queue');
      }
      
      return response.json();
    },
    onSuccess: (data, queueName) => {
      queryClient.invalidateQueries({ queryKey: queueKeys.all });
      toast({
        title: 'Queue Cleaned',
        description: `${queueName} queue has been cleaned`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Clean Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Hook to process multiple tenders
export function useBulkProcessTenders() {
  const triggerProcessing = useTriggerProcessing();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      tenderIds, 
      action 
    }: { 
      tenderIds: string[]; 
      action: 'validate' | 'categorize' | 'analyze' 
    }) => {
      const results = await Promise.allSettled(
        tenderIds.map(tenderId => 
          triggerProcessing.mutateAsync({ tenderId, action })
        )
      );
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      return { successful, failed, total: tenderIds.length };
    },
    onSuccess: (data) => {
      toast({
        title: 'Bulk Processing Started',
        description: `${data.successful} of ${data.total} tenders queued for processing`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Bulk Processing Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}