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
  capacityNeeded?: string;
  totalTonsNeeded?: number;
  createdAt: string;
  projectName?: string;
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

export const MOCK_JOBS: Job[] = [
  {
    id: 'job_001',
    contractorId: 'c_001',
    contractorName: 'Jake Henderson',
    contractorCompany: 'Henderson Excavation',
    jobType: 'single_load',
    material: 'Fill Dirt',
    originAddress: '4502 E McDowell Rd, Phoenix, AZ',
    originLat: 33.4655,
    originLng: -111.9738,
    destinationAddress: '2100 S 48th St, Tempe, AZ',
    destinationLat: 33.4085,
    destinationLng: -111.9535,
    distance: 8.2,
    rate: 85,
    rateType: 'per_hour',
    truckType: 'end_dump',
    trucksNeeded: 1,
    status: 'open',
    urgent: false,
    scheduledDate: '2026-02-14',
    pickupTime: '07:00',
    estimatedTrips: 3,
    estimatedCost: 340,
    requiresTarp: false,
    requiresWeightTickets: true,
    capacityNeeded: '13.5 ton',
    totalTonsNeeded: 40,
    createdAt: '2026-02-13T08:30:00Z',
    projectName: 'Tempe Development',
  },
  {
    id: 'job_002',
    contractorId: 'c_002',
    contractorName: 'Sarah Mitchell',
    contractorCompany: 'Desert Sun Construction',
    jobType: 'full_day',
    material: 'Gravel',
    originAddress: '7800 N 16th St, Phoenix, AZ',
    originLat: 33.5122,
    originLng: -112.0480,
    destinationAddress: '19600 N 7th Ave, Phoenix, AZ',
    destinationLat: 33.6495,
    destinationLng: -112.0785,
    distance: 15.4,
    rate: 750,
    rateType: 'flat_rate',
    truckType: 'end_dump',
    trucksNeeded: 2,
    status: 'open',
    urgent: true,
    scheduledDate: '2026-02-14',
    pickupTime: '06:00',
    estimatedCost: 750,
    requiresTarp: true,
    requiresWeightTickets: true,
    capacityNeeded: '13.5 ton',
    totalTonsNeeded: 120,
    createdAt: '2026-02-13T06:00:00Z',
    projectName: 'North Valley Site Prep',
  },
  {
    id: 'job_003',
    contractorId: 'c_003',
    contractorName: 'Tom Brooks',
    contractorCompany: 'Brooks Grading Co',
    jobType: 'multi_day',
    material: 'Concrete Rubble',
    originAddress: '1220 S Alma School Rd, Mesa, AZ',
    originLat: 33.3942,
    originLng: -111.8401,
    destinationAddress: '6000 E Main St, Mesa, AZ',
    destinationLat: 33.4152,
    destinationLng: -111.7370,
    distance: 10.1,
    rate: 95,
    rateType: 'per_hour',
    truckType: 'side_dump',
    trucksNeeded: 3,
    status: 'open',
    urgent: false,
    scheduledDate: '2026-02-17',
    pickupTime: '07:30',
    estimatedDays: 4,
    estimatedCost: 3040,
    requiresTarp: false,
    requiresWeightTickets: false,
    capacityNeeded: '15 ton',
    createdAt: '2026-02-12T14:00:00Z',
    projectName: 'Mesa Roadway Expansion',
  },
  {
    id: 'job_004',
    contractorId: 'c_001',
    contractorName: 'Jake Henderson',
    contractorCompany: 'Henderson Excavation',
    jobType: 'single_load',
    material: 'Topsoil',
    originAddress: '3300 W Camelback Rd, Phoenix, AZ',
    originLat: 33.5094,
    originLng: -112.1138,
    destinationAddress: '5600 N Central Ave, Phoenix, AZ',
    destinationLat: 33.5199,
    destinationLng: -112.0741,
    distance: 4.3,
    rate: 65,
    rateType: 'per_load',
    truckType: 'belly_dump',
    trucksNeeded: 1,
    status: 'open',
    urgent: false,
    scheduledDate: '2026-02-15',
    pickupTime: '08:00',
    estimatedTrips: 5,
    estimatedCost: 325,
    requiresTarp: false,
    requiresWeightTickets: false,
    createdAt: '2026-02-13T10:00:00Z',
  },
  {
    id: 'job_005',
    contractorId: 'c_004',
    contractorName: 'Maria Santos',
    contractorCompany: 'Santos Earthworks',
    driverId: 'usr_demo_001',
    jobType: 'full_day',
    material: 'Sand',
    originAddress: '2200 E University Dr, Tempe, AZ',
    originLat: 33.4217,
    originLng: -111.9178,
    destinationAddress: '1800 W Broadway Rd, Mesa, AZ',
    destinationLat: 33.4073,
    destinationLng: -111.8691,
    distance: 6.8,
    rate: 80,
    rateType: 'per_hour',
    truckType: 'end_dump',
    trucksNeeded: 1,
    status: 'accepted',
    urgent: false,
    scheduledDate: '2026-02-14',
    pickupTime: '06:30',
    estimatedCost: 640,
    requiresTarp: false,
    requiresWeightTickets: true,
    createdAt: '2026-02-12T16:00:00Z',
    projectName: 'Mesa Sports Complex',
  },
  {
    id: 'job_006',
    contractorId: 'c_002',
    contractorName: 'Sarah Mitchell',
    contractorCompany: 'Desert Sun Construction',
    driverId: 'usr_demo_001',
    jobType: 'single_load',
    material: 'Asphalt Millings',
    originAddress: '9200 N Pima Rd, Scottsdale, AZ',
    originLat: 33.5680,
    originLng: -111.8873,
    destinationAddress: '14000 N Hayden Rd, Scottsdale, AZ',
    destinationLat: 33.6200,
    destinationLng: -111.8973,
    distance: 5.5,
    rate: 450,
    rateType: 'flat_rate',
    truckType: 'end_dump',
    trucksNeeded: 1,
    status: 'completed',
    urgent: false,
    scheduledDate: '2026-02-12',
    pickupTime: '07:00',
    estimatedCost: 450,
    requiresTarp: true,
    requiresWeightTickets: true,
    createdAt: '2026-02-11T09:00:00Z',
  },
];

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv_001',
    jobId: 'job_005',
    jobMaterial: 'Sand',
    contractorName: 'Maria Santos',
    contractorCompany: 'Santos Earthworks',
    lastMessage: 'Great, see you at 6:30 AM tomorrow',
    lastMessageAt: '2026-02-13T15:30:00Z',
    unreadCount: 1,
  },
  {
    id: 'conv_002',
    jobId: 'job_006',
    jobMaterial: 'Asphalt Millings',
    contractorName: 'Sarah Mitchell',
    contractorCompany: 'Desert Sun Construction',
    lastMessage: 'Weight tickets look good. Payment processing.',
    lastMessageAt: '2026-02-12T17:00:00Z',
    unreadCount: 0,
  },
];

export const MOCK_MESSAGES: Record<string, Message[]> = {
  'job_005': [
    { id: 'm_001', jobId: 'job_005', senderId: 'c_004', senderName: 'Maria Santos', body: 'Hi Marcus, I have a full day sand haul for tomorrow. Interested?', read: true, createdAt: '2026-02-13T14:00:00Z' },
    { id: 'm_002', jobId: 'job_005', senderId: 'usr_demo_001', senderName: 'Marcus Rivera', body: 'Yes, I can take that. What time do you need me?', read: true, createdAt: '2026-02-13T14:15:00Z' },
    { id: 'm_003', jobId: 'job_005', senderId: 'c_004', senderName: 'Maria Santos', body: '6:30 AM at the pit on University Dr. Bring weight tickets.', read: true, createdAt: '2026-02-13T14:30:00Z' },
    { id: 'm_004', jobId: 'job_005', senderId: 'usr_demo_001', senderName: 'Marcus Rivera', body: 'Got it. I\'ll be there.', read: true, createdAt: '2026-02-13T15:00:00Z' },
    { id: 'm_005', jobId: 'job_005', senderId: 'c_004', senderName: 'Maria Santos', body: 'Great, see you at 6:30 AM tomorrow', read: false, createdAt: '2026-02-13T15:30:00Z' },
  ],
  'job_006': [
    { id: 'm_006', jobId: 'job_006', senderId: 'c_002', senderName: 'Sarah Mitchell', body: 'Job completed, thanks Marcus! Upload the weight tickets when you can.', read: true, createdAt: '2026-02-12T16:00:00Z' },
    { id: 'm_007', jobId: 'job_006', senderId: 'usr_demo_001', senderName: 'Marcus Rivera', body: 'All uploaded. 3 tickets total.', read: true, createdAt: '2026-02-12T16:30:00Z' },
    { id: 'm_008', jobId: 'job_006', senderId: 'c_002', senderName: 'Sarah Mitchell', body: 'Weight tickets look good. Payment processing.', read: true, createdAt: '2026-02-12T17:00:00Z' },
  ],
};

export const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 'n_001', type: 'new_load', title: 'New Load Available', message: 'Fill Dirt haul in Phoenix, AZ - 8.2 mi away', jobId: 'job_001', isRead: false, createdAt: '2026-02-13T08:30:00Z' },
  { id: 'n_002', type: 'new_load', title: 'Urgent Load', message: 'Gravel haul needed ASAP - Henderson Excavation', jobId: 'job_002', isRead: false, createdAt: '2026-02-13T06:00:00Z' },
  { id: 'n_003', type: 'load_accepted', title: 'Job Accepted', message: 'Your application for Sand haul was approved', jobId: 'job_005', isRead: true, createdAt: '2026-02-12T16:30:00Z' },
  { id: 'n_004', type: 'load_completed', title: 'Job Completed', message: 'Asphalt Millings job marked complete', jobId: 'job_006', isRead: true, createdAt: '2026-02-12T15:00:00Z' },
  { id: 'n_005', type: 'message', title: 'New Message', message: 'Maria Santos: Great, see you at 6:30 AM', jobId: 'job_005', isRead: false, createdAt: '2026-02-13T15:30:00Z' },
];

export const MOCK_EARNINGS: Earning[] = [
  { id: 'e_001', jobId: 'job_006', material: 'Asphalt Millings', contractorCompany: 'Desert Sun Construction', date: '2026-02-12', billedHours: 6, rate: 450, rateType: 'flat_rate', amount: 450, status: 'pending' },
  { id: 'e_002', jobId: 'job_prev_001', material: 'Fill Dirt', contractorCompany: 'Henderson Excavation', date: '2026-02-10', billedHours: 8, rate: 85, rateType: 'per_hour', amount: 680, status: 'paid' },
  { id: 'e_003', jobId: 'job_prev_002', material: 'Gravel', contractorCompany: 'Santos Earthworks', date: '2026-02-08', billedHours: 4.5, rate: 80, rateType: 'per_hour', amount: 360, status: 'paid' },
  { id: 'e_004', jobId: 'job_prev_003', material: 'Sand', contractorCompany: 'Brooks Grading Co', date: '2026-02-06', billedHours: 8, rate: 750, rateType: 'flat_rate', amount: 750, status: 'paid' },
  { id: 'e_005', jobId: 'job_prev_004', material: 'Concrete Rubble', contractorCompany: 'Henderson Excavation', date: '2026-02-04', billedHours: 6.5, rate: 90, rateType: 'per_hour', amount: 585, status: 'paid' },
  { id: 'e_006', jobId: 'job_prev_005', material: 'Topsoil', contractorCompany: 'Desert Sun Construction', date: '2026-02-01', billedHours: 3, rate: 65, rateType: 'per_load', amount: 195, status: 'paid' },
];

export function formatRate(rate: number, rateType: string): string {
  const formatted = '$' + rate.toFixed(0);
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
    case 'full_day': return 'Full Day';
    case 'multi_day': return estimatedDays && estimatedDays > 1 ? `Multi-Day (${estimatedDays}d)` : 'Full Day';
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
