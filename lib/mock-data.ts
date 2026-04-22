export interface Job {
  id: string;
  contractorId: string;
  contractorName: string;
  contractorCompany: string;
  driverId?: string;
  jobType: 'single_load' | 'full_day' | 'multi_day';
  material: string;
  originAddress: string;
  originLat: number;
  originLng: number;
  destinationAddress: string;
  destinationLat: number;
  destinationLng: number;
  distance: number;
  rate: number;
  rateType: 'flat_rate' | 'per_hour' | 'per_ton' | 'per_load';
  truckType: 'end_dump' | 'side_dump' | 'belly_dump';
  trucksNeeded: number;
  status: 'open' | 'accepted' | 'pending' | 'in_progress' | 'completed' | 'cancelled';
  urgent: boolean;
  scheduledDate: string;
  pickupTime: string;
  estimatedDays?: number;
  estimatedTrips?: number;
  estimatedCost?: number;
  requiresTarp: boolean;
  requiresWeightTickets: boolean;
  includesWeekends?: boolean;
  capacityNeeded?: string;
  totalTonsNeeded?: number;
  createdAt: string;
  projectName?: string;
  projectId?: string;
}

export interface Message {
  id: string;
  jobId: string;
  senderId: string;
  senderName: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface Conversation {
  id: string;
  jobId: string;
  jobMaterial: string;
  contractorName: string;
  contractorCompany: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  jobId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface Earning {
  id: string;
  jobId: string;
  material: string;
  contractorCompany: string;
  date: string;
  billedHours: number;
  rate: number;
  rateType: string;
  amount: number;
  status: 'pending' | 'paid';
}


export function formatRate(rate: number, rateType: string): string {
  const formatted = rate % 1 === 0 ? '$' + rate.toFixed(0) : '$' + rate.toFixed(2);
  switch (rateType) {
    case 'per_hour': return formatted + '/hr';
    case 'per_ton': return formatted + '/ton';
    case 'per_load': return formatted + '/load';
    case 'flat_rate': return formatted + ' flat';
    default: return formatted;
  }
}

export function formatJobType(jobType: string, estimatedDays?: number): string {
  switch (jobType) {
    case 'single_load': return 'Single Load';
    case 'full_day': return 'Single Day';
    case 'multi_day': return estimatedDays && estimatedDays > 1 ? `Multi-Day (${estimatedDays}d)` : 'Multi-Day';
    default: return jobType;
  }
}

export function formatTruckType(truckType: string): string {
  switch (truckType) {
    case 'end_dump': return 'End Dump';
    case 'side_dump': return 'Side Dump';
    case 'belly_dump': return 'Belly Dump';
    default: return truckType;
  }
}

export function getStatusColor(status: string): { bg: string; text: string } {
  switch (status) {
    case 'open': return { bg: 'rgba(255, 153, 0, 0.2)', text: '#FF9900' };
    case 'pending': return { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' };
    case 'accepted': return { bg: 'rgba(34, 197, 94, 0.2)', text: '#22c55e' };
    case 'in_progress': return { bg: 'rgba(59, 130, 246, 0.2)', text: '#3b82f6' };
    case 'upcoming': return { bg: 'rgba(147, 130, 246, 0.2)', text: '#9382f6' };
    case 'completed': return { bg: 'rgba(34, 197, 94, 0.2)', text: '#22c55e' };
    case 'cancelled': return { bg: 'rgba(239, 68, 68, 0.2)', text: '#ef4444' };
    default: return { bg: 'rgba(107, 112, 128, 0.2)', text: '#6b7080' };
  }
}

export function getJobTypeColor(jobType: string): { bg: string; text: string } {
  switch (jobType) {
    case 'single_load': return { bg: 'rgba(34, 197, 94, 0.2)', text: '#22c55e' };
    case 'full_day': return { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' };
    case 'multi_day': return { bg: 'rgba(59, 130, 246, 0.2)', text: '#3b82f6' };
    default: return { bg: 'rgba(107, 112, 128, 0.2)', text: '#6b7080' };
  }
}

export function timeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function isContractorRole(role: string): boolean {
  return (role?.includes('contractor') || role === 'trucking_company') ?? false;
}
