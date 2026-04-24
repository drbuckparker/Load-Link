import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ScrollView, StyleSheet, Platform, ActivityIndicator, Modal, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TruckIcon from '@/components/TruckIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { Job, formatRate, formatJobType, formatTruckType, getStatusColor, getJobTypeColor, timeAgo } from '@/lib/mock-data';
import { apiRequest, getApiUrl } from '@/lib/query-client';
import JobCard from '@/components/JobCard';
import LocationPickerModal from '@/components/LocationPickerModal';

function isContractorRole(role?: string): boolean {
  return (role?.includes('contractor') && role !== 'trucking_company') ?? false;
}

function mapDbJob(raw: any): Job {
  return {
    id: String(raw.id),
    contractorId: raw.contractor_id || raw.contractorId || '',
    contractorName: raw.contractor_name || raw.contractorName || '',
    contractorCompany: raw.contractor_company || raw.contractorCompany || '',
    driverId: raw.driver_id || raw.driverId,
    jobType: raw.job_type || raw.jobType || 'single_load',
    material: raw.material || '',
    originAddress: raw.origin_address || raw.originAddress || '',
    originLat: Number(raw.origin_lat || raw.originLat || 0),
    originLng: Number(raw.origin_lng || raw.originLng || 0),
    destinationAddress: raw.destination_address || raw.destinationAddress || '',
    destinationLat: Number(raw.destination_lat || raw.destinationLat || 0),
    destinationLng: Number(raw.destination_lng || raw.destinationLng || 0),
    distance: Number(raw.distance) || (() => {
      const lat1 = Number(raw.origin_lat || raw.originLat || 0);
      const lng1 = Number(raw.origin_lng || raw.originLng || 0);
      const lat2 = Number(raw.destination_lat || raw.destinationLat || 0);
      const lng2 = Number(raw.destination_lng || raw.destinationLng || 0);
      if (!lat1 || !lng1 || !lat2 || !lng2) return 0;
      const R = 3958.8;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
    })(),
    rate: Number(raw.rate || 0),
    rateType: raw.rate_type || raw.rateType || 'flat_rate',
    truckType: raw.truck_type || raw.truckType || 'end_dump',
    trucksNeeded: Number(raw.trucks_needed || raw.trucksNeeded || 1),
    status: raw.status || 'open',
    urgent: Boolean(raw.urgent),
    scheduledDate: raw.scheduled_date || raw.scheduledDate || '',
    pickupTime: raw.pickup_time || raw.pickupTime || '',
    estimatedDays: raw.estimated_days || raw.estimatedDays,
    estimatedTrips: raw.estimated_trips || raw.estimatedTrips,
    estimatedCost: raw.estimated_cost || raw.estimatedCost,
    requiresTarp: Boolean(raw.requires_tarp || raw.requiresTarp),
    requiresWeightTickets: Boolean(raw.requires_weight_tickets || raw.requiresWeightTickets),
    includesWeekends: Boolean(raw.includes_weekends || raw.includesWeekends),
    capacityNeeded: raw.capacity_needed || raw.capacityNeeded,
    totalTonsNeeded: raw.total_tons_needed || raw.totalTonsNeeded,
    createdAt: raw.created_at || raw.createdAt || '',
    projectName: raw.project_name || raw.projectName,
    projectId: raw.project_id || raw.projectId,
    pendingApplications: Number(raw.pending_applications || raw.pendingApplications || 0),
    approvedAssignments: Number(raw.approved_assignments || raw.approvedAssignments || 0),
  };
}

interface ProjectItem {
  id: string;
  name: string;
  job_number: string | null;
  awarded_amount: string | null;
  status: string;
  notes: string | null;
  site_address: string | null;
  site_lat: string | null;
  site_lng: string | null;
  created_at: string;
  job_count: number;
}

const DRIVER_FILTERS = ['Open', 'My Jobs', 'Completed', 'All'] as const;
const CONTRACTOR_FILTERS = ['Open', 'Active', 'Completed', 'All'] as const;
const TRUCK_TYPES = ['end_dump', 'side_dump', 'belly_dump'] as const;

export default function JobsBrowseScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isContractor = isContractorRole(user?.role);
  const params = useLocalSearchParams<{ filter?: string; date?: string; tab?: string; projectId?: string }>();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'jobs' | 'projects'>(params.tab === 'projects' ? 'projects' : 'jobs');
  const [activeFilter, setActiveFilter] = useState<string>(params.filter || (params.date ? 'All' : 'Open'));
  const [dateFilter, setDateFilter] = useState<string | undefined>(params.date || undefined);
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string | null>(params.projectId || null);

  useEffect(() => {
    if (params.filter) setActiveFilter(params.filter);
    if (params.date) setDateFilter(params.date);
    if (params.tab === 'projects') setActiveTab('projects');
    if (params.projectId) setSelectedProjectFilter(params.projectId);
  }, [params.filter, params.date, params.tab, params.projectId]);

  const [search, setSearch] = useState('');
  const [showTruckFilter, setShowTruckFilter] = useState(false);
  const [selectedTruckType, setSelectedTruckType] = useState<string | null>(null);
  const [searchRadius, setSearchRadius] = useState<number | null>(null);
  const [userCoord, setUserCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectJobNumber, setNewProjectJobNumber] = useState('');
  const [newProjectSiteAddress, setNewProjectSiteAddress] = useState('');
  const [newProjectNotes, setNewProjectNotes] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectJobNumber, setEditProjectJobNumber] = useState('');
  const [editProjectSiteAddress, setEditProjectSiteAddress] = useState('');
  const [editProjectNotes, setEditProjectNotes] = useState('');
  const [editProjectAwarded, setEditProjectAwarded] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [newProjectSiteLat, setNewProjectSiteLat] = useState<number | null>(null);
  const [newProjectSiteLng, setNewProjectSiteLng] = useState<number | null>(null);
  const [newSiteSuggestions, setNewSiteSuggestions] = useState<any[]>([]);
  const [showNewSiteSuggestions, setShowNewSiteSuggestions] = useState(false);
  const [editProjectSiteLat, setEditProjectSiteLat] = useState<number | null>(null);
  const [editProjectSiteLng, setEditProjectSiteLng] = useState<number | null>(null);
  const [editSiteSuggestions, setEditSiteSuggestions] = useState<any[]>([]);
  const [showEditSiteSuggestions, setShowEditSiteSuggestions] = useState(false);
  const [showNewProjectMapPicker, setShowNewProjectMapPicker] = useState(false);
  const [showEditProjectMapPicker, setShowEditProjectMapPicker] = useState(false);
  const editingProjectRef = useRef<ProjectItem | null>(null);
  const siteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const siteGeoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const c = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          userLocationRef.current = c;
          setUserCoord(c);
        }
      } catch {}
    })();
  }, []);

  const radiusOriginCoord = useMemo<{ lat: number; lng: number } | null>(() => {
    if (userCoord) return userCoord;
    const lat = Number(user?.secondaryLocationLat || user?.primaryLocationLat || 0);
    const lng = Number(user?.secondaryLocationLng || user?.primaryLocationLng || 0);
    if (lat && lng) return { lat, lng };
    return null;
  }, [userCoord, user?.secondaryLocationLat, user?.secondaryLocationLng, user?.primaryLocationLat, user?.primaryLocationLng]);

  const statusParam = useMemo(() => {
    if (activeFilter === 'All') return undefined;
    if (activeFilter === 'Open') return 'open';
    if (activeFilter === 'My Jobs') return 'accepted';
    if (activeFilter === 'Active') return 'in_progress';
    if (activeFilter === 'Completed') return 'completed';
    return undefined;
  }, [activeFilter]);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (statusParam) p.set('status', statusParam);
    if (selectedTruckType) p.set('truck_type', selectedTruckType);
    if (search.trim()) p.set('search', search.trim());
    if (!isContractor && user?.id && activeFilter === 'My Jobs') {
      p.set('driver_id', user.id);
    }
    if (dateFilter) p.set('date', dateFilter);
    if (selectedProjectFilter) p.set('project_id', selectedProjectFilter);
    if (!isContractor) {
      const lat = user?.secondaryLocationLat || user?.primaryLocationLat;
      const lng = user?.secondaryLocationLng || user?.primaryLocationLng;
      if (lat && lng) {
        p.set('lat', String(lat));
        p.set('lng', String(lng));
      }
    }
    return p.toString();
  }, [statusParam, selectedTruckType, search, isContractor, user?.id, activeFilter, dateFilter, selectedProjectFilter, user?.secondaryLocationLat, user?.secondaryLocationLng, user?.primaryLocationLat, user?.primaryLocationLng]);

  const endpoint = (isContractor && !dateFilter) ? '/api/contractor/jobs' : '/api/jobs';
  const queryUrl = queryParams ? `${endpoint}?${queryParams}` : endpoint;

  const { data: rawJobs, isLoading, refetch } = useQuery<any[]>({
    queryKey: [queryUrl],
    enabled: !!user && activeTab === 'jobs',
    refetchOnMount: 'always',
  });

  const projectsQueryUrl = '/api/projects?include_deleted=true';
  const { data: _projects, isLoading: projectsLoading, refetch: refetchProjects } = useQuery<ProjectItem[]>({
    queryKey: [projectsQueryUrl],
    enabled: !!user && isContractor,
  });
  const projects = _projects || [];

  const createProjectMutation = useMutation({
    mutationFn: async (data: { name: string; job_number?: string; site_address?: string; site_lat?: number; site_lng?: number; notes?: string }) => {
      const res = await apiRequest('POST', '/api/projects', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey.some((k) => typeof k === 'string' && k.includes('/api/projects')) });
      setShowCreateProject(false);
      setNewProjectName('');
      setNewProjectJobNumber('');
      setNewProjectSiteAddress('');
      setNewProjectNotes('');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert('Error', 'Failed to create project');
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async (data: { id: string; name?: string; job_number?: string; site_address?: string; site_lat?: number; site_lng?: number; notes?: string; awarded_amount?: string }) => {
      const { id, ...body } = data;
      const res = await apiRequest('PUT', `/api/projects/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey.some((k) => typeof k === 'string' && k.includes('/api/projects')) });
      setEditingProject(null);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert('Error', 'Failed to update project');
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/projects/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey.some((k) => typeof k === 'string' && k.includes('/api/projects')) });
      setEditingProject(null);
      setSelectedProjectFilter(null);
      setActiveTab('projects');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert('Error', 'Failed to delete project');
    },
  });

  const restoreProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('POST', `/api/projects/${id}/restore`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey.some((k) => typeof k === 'string' && k.includes('/api/projects')) });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert('Error', 'Failed to restore project');
    },
  });

  const handleDeleteProject = useCallback(() => {
    if (!editingProject) return;
    const message = `Are you sure you want to delete "${editingProject.name}"? All jobs in this project will be cancelled. You can restore it later from the Archived section.`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) {
        deleteProjectMutation.mutate(String(editingProject.id));
      }
      return;
    }
    Alert.alert(
      'Delete Project',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteProjectMutation.mutate(String(editingProject.id)),
        },
      ]
    );
  }, [editingProject, deleteProjectMutation]);

  function openEditProject(project: ProjectItem) {
    setEditingProject(project);
    setEditProjectName(project.name || '');
    setEditProjectJobNumber(project.job_number || '');
    setEditProjectSiteAddress(project.site_address || '');
    setEditProjectSiteLat(project.site_lat ? Number(project.site_lat) : null);
    setEditProjectSiteLng(project.site_lng ? Number(project.site_lng) : null);
    setEditProjectNotes(project.notes || '');
    setEditProjectAwarded(project.awarded_amount ? String(project.awarded_amount) : '');
  }

  const handleUpdateProject = useCallback(() => {
    if (!editingProject || !editProjectName.trim()) return;
    updateProjectMutation.mutate({
      id: String(editingProject.id),
      name: editProjectName.trim(),
      job_number: editProjectJobNumber.trim(),
      site_address: editProjectSiteAddress.trim(),
      ...(editProjectSiteLat != null ? { site_lat: editProjectSiteLat } : {}),
      ...(editProjectSiteLng != null ? { site_lng: editProjectSiteLng } : {}),
      notes: editProjectNotes.trim(),
      awarded_amount: editProjectAwarded.trim(),
    });
  }, [editingProject, editProjectName, editProjectJobNumber, editProjectSiteAddress, editProjectSiteLat, editProjectSiteLng, editProjectNotes, editProjectAwarded]);

  const jobs = useMemo(() => {
    if (!rawJobs) return [];
    const list = Array.isArray(rawJobs) ? rawJobs : [];
    let mapped = list.map(mapDbJob);
    if (!isContractor && searchRadius != null && radiusOriginCoord) {
      const R = 3958.8;
      const { lat: oLat, lng: oLng } = radiusOriginCoord;
      mapped = mapped.filter((j) => {
        const lat = j.originLat || j.destinationLat;
        const lng = j.originLng || j.destinationLng;
        if (!lat || !lng) return false;
        const dLat = (lat - oLat) * Math.PI / 180;
        const dLng = (lng - oLng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(oLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        const miles = 2 * R * Math.asin(Math.sqrt(a));
        return miles <= searchRadius;
      });
    }
    if (activeFilter === 'Open') {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      mapped = mapped.filter(j => {
        if (!j.scheduledDate) return true;
        const raw = String(j.scheduledDate);
        const dateStr = raw.length >= 10 ? raw.substring(0, 10) : raw;
        const days = parseFloat(String(j.estimatedDays || '1')) || 1;
        if (days <= 1) {
          return dateStr >= todayStr;
        }
        const [y, m, d] = dateStr.split('-').map(Number);
        const start = new Date(y, m - 1, d);
        let added = 0;
        let cur = new Date(start);
        while (added < days - 1) {
          cur.setDate(cur.getDate() + 1);
          if (cur.getDay() !== 0 && cur.getDay() !== 6) added++;
        }
        const endStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        return endStr >= todayStr;
      });
    }
    return mapped;
  }, [rawJobs, activeFilter]);

  const jobsListData = useMemo(() => {
    const sortPending = (list: Job[]) => {
      if (!isContractor) return list;
      return [...list].sort((a, b) => (b.pendingApplications || 0 ? 1 : 0) - (a.pendingApplications || 0 ? 1 : 0));
    };
    if (!selectedProjectFilter || activeFilter === 'Completed') return sortPending(jobs) as any[];
    const completed = jobs.filter(j => String(j.status).toLowerCase() === 'completed');
    const active = jobs.filter(j => String(j.status).toLowerCase() !== 'completed');
    const activeSorted = sortPending(active);
    if (completed.length === 0) return activeSorted as any[];
    return [...activeSorted, { id: '__completed_divider__', __divider: true, count: completed.length }, ...completed] as any[];
  }, [jobs, selectedProjectFilter, activeFilter, isContractor]);

  const filteredProjects = useMemo(() => {
    let list = projects;
    if (showArchived) {
      list = list.filter(p => !!(p as any).deleted_at);
    } else {
      list = list.filter(p => !(p as any).deleted_at);
    }
    if (projectSearch.trim()) {
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(projectSearch.toLowerCase()) ||
        (p.job_number || '').toLowerCase().includes(projectSearch.toLowerCase())
      );
    }
    return list;
  }, [projects, projectSearch, showArchived]);

  const selectedProjectData = useMemo(() => {
    if (!selectedProjectFilter) return null;
    return projects.find(p => String(p.id) === selectedProjectFilter) || null;
  }, [selectedProjectFilter, projects]);

  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const filters = isContractor ? CONTRACTOR_FILTERS : DRIVER_FILTERS;

  function renderContractorCard({ item }: { item: Job }) {
    const statusColor = getStatusColor(item.status);
    const jobTypeColor = getJobTypeColor(item.jobType);
    const pending = item.pendingApplications || 0;
    const hasPending = pending > 0;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.cardContainer,
          hasPending && { borderColor: Colors.warning, borderWidth: 1, borderStyle: 'dashed' as any, backgroundColor: Colors.warningBg },
          pressed && styles.cardPressed,
        ]}
        onPress={() => router.push(`/job/${item.id}`)}
      >
        {hasPending && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(245,158,11,0.25)' }}>
            <Ionicons name="alert-circle" size={14} color={Colors.warning} />
            <Text style={{ fontFamily: 'ChakraPetch_700Bold', fontSize: 12, color: Colors.warning, letterSpacing: 0.5, flex: 1 }}>
              {pending} TRUCK{pending !== 1 ? 'S' : ''} APPLIED — TAP TO REVIEW
            </Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.warning} />
          </View>
        )}
        {item.projectName && !selectedProjectFilter && (
          <Text style={styles.cardProjectName} numberOfLines={1}>{item.projectName}</Text>
        )}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.cardMaterial} numberOfLines={1}>{item.material}</Text>
          </View>
          <Text style={styles.cardRate}>{formatRate(item.rate, item.rateType)}</Text>
        </View>
        {(item.requiresTarp || item.requiresWeightTickets || item.urgent) && (
          <View style={styles.requirementsRow}>
            {item.requiresTarp && (
              <View style={styles.urgentBadge}>
                <Ionicons name="shield-checkmark" size={10} color={Colors.primary} />
                <Text style={styles.urgentText}>TARP</Text>
              </View>
            )}
            {item.requiresWeightTickets && (
              <View style={styles.urgentBadge}>
                <Ionicons name="document-text" size={10} color={Colors.primary} />
                <Text style={styles.urgentText}>WEIGHT TICKETS</Text>
              </View>
            )}
            {item.urgent && (
              <View style={styles.urgentBadge}>
                <Ionicons name="clipboard" size={10} color={Colors.primary} />
                <Text style={styles.urgentText}>PAPERWORK</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.badgeText, { color: statusColor.text }]}>
              {item.status.replace('_', ' ').toUpperCase()}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: jobTypeColor.bg }]}>
            <Text style={[styles.badgeText, { color: jobTypeColor.text }]}>{formatJobType(item.jobType, item.estimatedDays)}</Text>
          </View>
          <View style={styles.badge}>
            <TruckIcon size={12} />
            <Text style={styles.badgeText}>{formatTruckType(item.truckType)}</Text>
          </View>
        </View>

        <View style={styles.locationRow}>
          <View style={styles.locationDot}>
            <View style={styles.dotGreen} />
            <View style={styles.dotLine} />
            <View style={styles.dotOrange} />
          </View>
          <View style={styles.locationTexts}>
            <Text style={styles.locationText} numberOfLines={1}>{item.originAddress}</Text>
            <Text style={styles.locationText} numberOfLines={1}>{item.destinationAddress}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.footerItem}>
            <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.footerText}>
              {item.scheduledDate ? (() => {
                const raw = String(item.scheduledDate);
                const ds = raw.length >= 10 ? raw.substring(0, 10) : raw;
                const [y, m, d] = ds.split('-').map(Number);
                return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              })() : '—'}
            </Text>
          </View>
          <View style={styles.footerItem}>
            <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.footerText}>{item.pickupTime || '—'}</Text>
          </View>
          {item.driverId ? (
            <View style={styles.footerItem}>
              <Ionicons name="person-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.footerText}>Assigned</Text>
            </View>
          ) : (
            <View style={styles.footerItem}>
              <Ionicons name="people-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.footerText}>No driver</Text>
            </View>
          )}
          <Text style={styles.timeAgoText}>{timeAgo(item.createdAt)}</Text>
        </View>
      </Pressable>
    );
  }

  function renderDriverCard({ item }: { item: Job }) {
    return (
      <JobCard
        job={item}
        onPress={() => router.push(`/job/${item.id}`)}
        showStatus={activeFilter === 'My Jobs' || activeFilter === 'Completed'}
      />
    );
  }

  function renderProjectCard({ item }: { item: ProjectItem }) {
    const isActive = item.status === 'active';
    const isDeleted = item.status === 'deleted';
    return (
      <View style={[styles.projectCard, isDeleted && { opacity: 0.6 }]}>
        <Pressable
          style={({ pressed }) => [{ flex: 1 }, pressed && styles.cardPressed]}
          onPress={() => {
            if (isDeleted) return;
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSelectedProjectFilter(String(item.id));
            setActiveTab('jobs');
            setActiveFilter('All');
          }}
        >
          <View style={styles.projectCardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.projectCardName} numberOfLines={1}>{item.name}</Text>
              {item.job_number ? (
                <Text style={styles.projectJobNumber}>#{item.job_number}</Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.projectStatusBadge, {
                backgroundColor: isDeleted ? Colors.destructiveBg : isActive ? Colors.successBg : Colors.muted
              }]}>
                <Text style={[styles.projectStatusText, {
                  color: isDeleted ? Colors.destructive : isActive ? Colors.success : Colors.textMuted
                }]}>{isDeleted ? 'ARCHIVED' : (item.status?.toUpperCase() || 'ACTIVE')}</Text>
              </View>
            </View>
          </View>

          {item.site_address ? (
            <View style={styles.projectDetailRow}>
              <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.projectDetailText} numberOfLines={1}>{item.site_address}</Text>
            </View>
          ) : null}

          <View style={styles.projectFooter}>
            <View style={styles.projectStat}>
              <Ionicons name="briefcase-outline" size={15} color={Colors.primary} />
              <Text style={styles.projectStatText}>{item.job_count} job{item.job_count !== 1 ? 's' : ''}</Text>
            </View>
            {item.awarded_amount && Number(item.awarded_amount) > 0 ? (
              <View style={styles.projectStat}>
                <Ionicons name="cash-outline" size={15} color={Colors.success} />
                <Text style={[styles.projectStatText, { color: Colors.success }]}>
                  ${Number(item.awarded_amount).toLocaleString()}
                </Text>
              </View>
            ) : null}
            <Text style={styles.timeAgoText}>{timeAgo(item.created_at)}</Text>
          </View>
        </Pressable>

        <View style={styles.projectCardActions}>
          {isDeleted ? (
            <Pressable
              style={[styles.projectEditBtn, { backgroundColor: Colors.successBg }]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                Alert.alert(
                  'Restore Project',
                  `Restore "${item.name}"? The project will become active again.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Restore', onPress: () => restoreProjectMutation.mutate(String(item.id)) },
                  ]
                );
              }}
              hitSlop={8}
            >
              <Ionicons name="refresh" size={18} color={Colors.success} />
            </Pressable>
          ) : (
            <>
              <Pressable
                style={styles.projectEditBtn}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  openEditProject(item);
                }}
                hitSlop={8}
              >
                <Ionicons name="create-outline" size={18} color={Colors.primary} />
              </Pressable>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </>
          )}
        </View>
      </View>
    );
  }

  const handleCreateProject = useCallback(() => {
    if (!newProjectName.trim()) return;
    createProjectMutation.mutate({
      name: newProjectName.trim(),
      ...(newProjectJobNumber.trim() ? { job_number: newProjectJobNumber.trim() } : {}),
      ...(newProjectSiteAddress.trim() ? { site_address: newProjectSiteAddress.trim() } : {}),
      ...(newProjectSiteLat != null ? { site_lat: newProjectSiteLat } : {}),
      ...(newProjectSiteLng != null ? { site_lng: newProjectSiteLng } : {}),
      ...(newProjectNotes.trim() ? { notes: newProjectNotes.trim() } : {}),
    });
  }, [newProjectName, newProjectJobNumber, newProjectSiteAddress, newProjectSiteLat, newProjectSiteLng, newProjectNotes]);

  async function fetchSiteSuggestions(text: string, target: 'new' | 'edit') {
    if (text.trim().length < 2) {
      if (target === 'new') { setNewSiteSuggestions([]); setShowNewSiteSuggestions(false); }
      else { setEditSiteSuggestions([]); setShowEditSiteSuggestions(false); }
      return;
    }
    try {
      const baseUrl = getApiUrl();
      const url = new URL('/api/places/autocomplete', baseUrl);
      url.searchParams.set('input', text);
      if (userLocationRef.current) {
        url.searchParams.set('lat', String(userLocationRef.current.lat));
        url.searchParams.set('lng', String(userLocationRef.current.lng));
      }
      const res = await apiRequest('GET', url.pathname + url.search);
      if (!res.ok) return;
      const data = await res.json();
      if (target === 'new') { setNewSiteSuggestions(data); setShowNewSiteSuggestions(data.length > 0); }
      else { setEditSiteSuggestions(data); setShowEditSiteSuggestions(data.length > 0); }
    } catch {}
  }

  async function selectSiteSuggestion(placeId: string, description: string, target: 'new' | 'edit') {
    if (target === 'new') { setNewProjectSiteAddress(description); setShowNewSiteSuggestions(false); setNewSiteSuggestions([]); }
    else { setEditProjectSiteAddress(description); setShowEditSiteSuggestions(false); setEditSiteSuggestions([]); }
    try {
      const res = await apiRequest('GET', `/api/places/details?place_id=${encodeURIComponent(placeId)}`);
      if (res.ok) {
        const data = await res.json();
        if (target === 'new') {
          if (data.address) setNewProjectSiteAddress(data.address);
          setNewProjectSiteLat(data.lat); setNewProjectSiteLng(data.lng);
        } else {
          if (data.address) setEditProjectSiteAddress(data.address);
          setEditProjectSiteLat(data.lat); setEditProjectSiteLng(data.lng);
        }
      }
    } catch {}
  }

  async function geocodeSiteAddress(address: string, target: 'new' | 'edit') {
    if (address.trim().length < 3) return;
    try {
      const res = await apiRequest('GET', `/api/places/geocode?address=${encodeURIComponent(address)}`);
      if (res.ok) {
        const data = await res.json();
        if (target === 'new') {
          setNewProjectSiteLat(data.lat); setNewProjectSiteLng(data.lng);
          if (data.address) setNewProjectSiteAddress(data.address);
        } else {
          setEditProjectSiteLat(data.lat); setEditProjectSiteLng(data.lng);
          if (data.address) setEditProjectSiteAddress(data.address);
        }
      }
    } catch {}
  }

  function handleSiteAddressChange(text: string, target: 'new' | 'edit') {
    if (target === 'new') { setNewProjectSiteAddress(text); setNewProjectSiteLat(null); setNewProjectSiteLng(null); }
    else { setEditProjectSiteAddress(text); setEditProjectSiteLat(null); setEditProjectSiteLng(null); }
    if (siteDebounceRef.current) clearTimeout(siteDebounceRef.current);
    if (siteGeoRef.current) clearTimeout(siteGeoRef.current);
    siteDebounceRef.current = setTimeout(() => fetchSiteSuggestions(text, target), 300);
    siteGeoRef.current = setTimeout(() => {
      if (text.trim().length >= 3) geocodeSiteAddress(text, target);
    }, 2000);
  }

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      <View style={styles.header}>
        <Pressable onPress={() => {
          if (selectedProjectFilter) {
            setSelectedProjectFilter(null);
            setActiveTab('projects');
            return;
          }
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(tabs)');
          }
        }} style={styles.backButton} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {selectedProjectFilter && selectedProjectData
            ? selectedProjectData.name.toUpperCase()
            : isContractor ? 'MY JOBS' : (user?.role === 'trucking_company' ? 'FIND JOBS' : 'FIND LOADS')}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {isContractor && !selectedProjectFilter && (
        <View style={styles.tabToggleRow}>
          <Pressable
            style={[styles.tabToggle, activeTab === 'jobs' && styles.tabToggleActive]}
            onPress={() => { setActiveTab('jobs'); if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Ionicons name="briefcase" size={16} color={activeTab === 'jobs' ? Colors.primary : Colors.textMuted} />
            <Text style={[styles.tabToggleText, activeTab === 'jobs' && styles.tabToggleTextActive]}>Jobs</Text>
          </Pressable>
          <Pressable
            style={[styles.tabToggle, activeTab === 'projects' && styles.tabToggleActive]}
            onPress={() => { setActiveTab('projects'); if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Ionicons name="folder" size={16} color={activeTab === 'projects' ? Colors.primary : Colors.textMuted} />
            <Text style={[styles.tabToggleText, activeTab === 'projects' && styles.tabToggleTextActive]}>Projects</Text>
          </Pressable>
        </View>
      )}

      {selectedProjectFilter && selectedProjectData && (
        <View style={styles.projectBanner}>
          <Ionicons name="folder" size={16} color={Colors.primary} />
          <Text style={styles.projectBannerText} numberOfLines={1}>
            Showing jobs in "{selectedProjectData.name}"
          </Text>
          <Pressable
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              openEditProject(selectedProjectData);
            }}
            hitSlop={8}
          >
            <Ionicons name="create-outline" size={20} color={Colors.primary} />
          </Pressable>
        </View>
      )}

      {activeTab === 'jobs' && (
        <>
          <View style={styles.searchRow}>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search jobs..."
                placeholderTextColor={Colors.textMuted}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                </Pressable>
              )}
            </View>
            <Pressable
              style={[styles.filterButton, showTruckFilter && styles.filterButtonActive]}
              onPress={() => setShowTruckFilter(!showTruckFilter)}
              hitSlop={4}
            >
              <Ionicons name="options-outline" size={20} color={showTruckFilter ? Colors.primary : Colors.textSecondary} />
            </Pressable>
          </View>

          {!selectedProjectFilter && (
            <View style={styles.chipRow}>
              {filters.map((filter) => {
                const isActive = activeFilter === filter;
                return (
                  <Pressable
                    key={filter}
                    style={[styles.chip, isActive && styles.chipActive]}
                    onPress={() => setActiveFilter(filter)}
                  >
                    <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{filter}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {dateFilter && (
            <View style={styles.dateBanner}>
              <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
              <Text style={styles.dateBannerText}>
                Showing jobs for {new Date(dateFilter + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
              </Text>
              <Pressable onPress={() => setDateFilter(undefined)} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </Pressable>
            </View>
          )}

          {showTruckFilter && (
            <View style={styles.truckFilterSection}>
              <Text style={styles.truckFilterLabel}>Truck Type</Text>
              <View style={styles.truckFilterRow}>
                <Pressable
                  style={[styles.truckChip, !selectedTruckType && styles.truckChipActive]}
                  onPress={() => setSelectedTruckType(null)}
                >
                  <Text style={[styles.truckChipText, !selectedTruckType && styles.truckChipTextActive]}>All</Text>
                </Pressable>
                {TRUCK_TYPES.map((tt) => {
                  const isActive = selectedTruckType === tt;
                  return (
                    <Pressable
                      key={tt}
                      style={[styles.truckChip, isActive && styles.truckChipActive]}
                      onPress={() => setSelectedTruckType(isActive ? null : tt)}
                    >
                      <TruckIcon size={14} />
                      <Text style={[styles.truckChipText, isActive && styles.truckChipTextActive]}>{formatTruckType(tt)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {!isContractor && (
                <>
                  <Text style={[styles.truckFilterLabel, { marginTop: 14 }]}>Distance</Text>
                  <View style={styles.truckFilterRow}>
                    <Pressable
                      style={[styles.truckChip, searchRadius == null && styles.truckChipActive]}
                      onPress={() => setSearchRadius(null)}
                    >
                      <Text style={[styles.truckChipText, searchRadius == null && styles.truckChipTextActive]}>Any</Text>
                    </Pressable>
                    {[25, 50, 100, 250].map((mi) => {
                      const isActive = searchRadius === mi;
                      return (
                        <Pressable
                          key={mi}
                          style={[styles.truckChip, isActive && styles.truckChipActive]}
                          onPress={() => setSearchRadius(isActive ? null : mi)}
                          disabled={!radiusOriginCoord}
                        >
                          <Ionicons name="location-outline" size={14} color={isActive ? Colors.primary : Colors.textSecondary} />
                          <Text style={[styles.truckChipText, isActive && styles.truckChipTextActive]}>{mi} mi</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {!radiusOriginCoord && (
                    <Text style={{ color: Colors.textMuted, fontSize: 12, marginTop: 6, fontFamily: 'Inter_400Regular' }}>
                      Enable location to filter by distance
                    </Text>
                  )}
                </>
              )}
            </View>
          )}

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : jobs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="briefcase-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No jobs found</Text>
              <Text style={styles.emptySubtitle}>
                {selectedProjectFilter ? 'No jobs in this project yet. Tap + to add one.' :
                  search ? 'Try adjusting your search or filters' : 'Check back later for new opportunities'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={jobsListData}
              keyExtractor={(item: any) => item.id}
              renderItem={({ item }: any) => {
                if (item.__divider) {
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                      <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
                      <Text style={{ fontFamily: 'ChakraPetch_600SemiBold', fontSize: 11, color: Colors.textMuted, letterSpacing: 1 }}>
                        COMPLETED ({item.count})
                      </Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
                    </View>
                  );
                }
                return isContractor ? renderContractorCard({ item }) : renderDriverCard({ item });
              }}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
              showsVerticalScrollIndicator={false}
              onRefresh={refetch}
              refreshing={false}
            />
          )}
        </>
      )}

      {activeTab === 'projects' && isContractor && (
        <>
          <View style={styles.searchRow}>
            {showArchived ? (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, paddingVertical: 10 }}
                onPress={() => setShowArchived(false)}
              >
                <Ionicons name="arrow-back" size={20} color={Colors.primary} />
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary }}>Back to Projects</Text>
              </Pressable>
            ) : (
              <View style={styles.searchBar}>
                <Ionicons name="search" size={18} color={Colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search projects..."
                  placeholderTextColor={Colors.textMuted}
                  value={projectSearch}
                  onChangeText={setProjectSearch}
                  returnKeyType="search"
                />
                {projectSearch.length > 0 && (
                  <Pressable onPress={() => setProjectSearch('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                  </Pressable>
                )}
              </View>
            )}
          </View>

          {projectsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : filteredProjects.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name={showArchived ? "trash-outline" : "folder-outline"} size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {showArchived ? 'No deleted projects' : projectSearch ? 'No matching projects' : 'No projects yet'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {showArchived ? 'Deleted projects will appear here' : projectSearch ? 'Try a different search term' : 'Create a project to organize your jobs'}
              </Text>
              {!projectSearch && !showArchived && (
                <Pressable
                  style={styles.emptyCreateBtn}
                  onPress={() => setShowCreateProject(true)}
                >
                  <Ionicons name="add" size={18} color={Colors.primaryForeground} />
                  <Text style={styles.emptyCreateBtnText}>Create Project</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <FlatList
              data={filteredProjects}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderProjectCard}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
              showsVerticalScrollIndicator={false}
              onRefresh={refetchProjects}
              refreshing={false}
              ListFooterComponent={!showArchived && projects.some((p: any) => p.deleted_at) ? (
                <Pressable
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 8, paddingVertical: 14, marginTop: 16, marginBottom: 80,
                    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
                    backgroundColor: Colors.card,
                  }}
                  onPress={() => { setShowArchived(true); setProjectSearch(''); }}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.textMuted} />
                  <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.textMuted }}>
                    View Deleted Projects
                  </Text>
                </Pressable>
              ) : <View style={{ height: 80 }} />}
            />
          )}
        </>
      )}

      {isContractor && (
        <Pressable
          style={[styles.fab, { bottom: Platform.OS === 'web' ? 34 + 20 : insets.bottom + 20 }]}
          onPress={() => {
            if (activeTab === 'projects') {
              setShowCreateProject(true);
            } else {
              if (selectedProjectFilter) {
                router.push({ pathname: '/create-job', params: { projectId: selectedProjectFilter } } as any);
              } else {
                router.push('/create-job');
              }
            }
          }}
        >
          <Ionicons name="add" size={28} color={Colors.primaryForeground} />
        </Pressable>
      )}

      <Modal
        visible={showCreateProject}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateProject(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowCreateProject(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>NEW PROJECT</Text>
              <Pressable onPress={() => setShowCreateProject(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Project Name *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Black Creek Development"
                placeholderTextColor={Colors.textMuted}
                value={newProjectName}
                onChangeText={setNewProjectName}
                autoFocus
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Job Number</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. JOB-2026-001"
                placeholderTextColor={Colors.textMuted}
                value={newProjectJobNumber}
                onChangeText={setNewProjectJobNumber}
              />
            </View>

            <View style={[styles.modalField, { zIndex: 100 }]}>
              <Text style={styles.modalLabel}>Site Address</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. 123 Main St"
                placeholderTextColor={Colors.textMuted}
                value={newProjectSiteAddress}
                onChangeText={(text) => handleSiteAddressChange(text, 'new')}
                onFocus={() => { if (newSiteSuggestions.length > 0) setShowNewSiteSuggestions(true); }}
              />
              {showNewSiteSuggestions && newSiteSuggestions.length > 0 && (
                <View style={styles.suggestionsBox}>
                  {newSiteSuggestions.map((s: any) => (
                    <Pressable key={s.place_id} style={styles.suggestionItem} onPress={() => selectSiteSuggestion(s.place_id, s.description, 'new')}>
                      <Ionicons name="location-outline" size={16} color={Colors.textSecondary} />
                      <Text style={styles.suggestionText} numberOfLines={1}>{s.description}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {newProjectSiteLat != null && (
                <View style={styles.coordBadge}>
                  <Ionicons name="navigate" size={12} color={Colors.primary} />
                  <Text style={styles.coordText}>{newProjectSiteLat.toFixed(4)}, {newProjectSiteLng?.toFixed(4)}</Text>
                </View>
              )}
              <Pressable
                style={styles.dropPinBtn}
                onPress={() => { setShowCreateProject(false); setTimeout(() => setShowNewProjectMapPicker(true), 300); }}
              >
                <Ionicons name="location" size={16} color={Colors.primary} />
                <Text style={styles.dropPinBtnText}>Drop Pin on Map</Text>
              </Pressable>
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Notes</Text>
              <TextInput
                style={[styles.modalInput, { height: 72, textAlignVertical: 'top' }]}
                placeholder="Optional project notes..."
                placeholderTextColor={Colors.textMuted}
                value={newProjectNotes}
                onChangeText={setNewProjectNotes}
                multiline
              />
            </View>

            <Pressable
              style={[styles.modalCreateBtn, !newProjectName.trim() && { opacity: 0.5 }]}
              onPress={handleCreateProject}
              disabled={!newProjectName.trim() || createProjectMutation.isPending}
            >
              {createProjectMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.primaryForeground} />
              ) : (
                <>
                  <Ionicons name="add-circle" size={20} color={Colors.primaryForeground} />
                  <Text style={styles.modalCreateBtnText}>Create Project</Text>
                </>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!editingProject}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingProject(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setEditingProject(null)}>
          <Pressable style={[styles.modalContent, { maxHeight: '85%' }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>EDIT PROJECT</Text>
              <Pressable onPress={() => setEditingProject(null)} hitSlop={8}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Project Name *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Project name"
                  placeholderTextColor={Colors.textMuted}
                  value={editProjectName}
                  onChangeText={setEditProjectName}
                  autoFocus
                />
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Job Number</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. JOB-2026-001"
                  placeholderTextColor={Colors.textMuted}
                  value={editProjectJobNumber}
                  onChangeText={setEditProjectJobNumber}
                />
              </View>

              <View style={[styles.modalField, { zIndex: 100 }]}>
                <Text style={styles.modalLabel}>Site Address</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 123 Main St"
                  placeholderTextColor={Colors.textMuted}
                  value={editProjectSiteAddress}
                  onChangeText={(text) => handleSiteAddressChange(text, 'edit')}
                  onFocus={() => { if (editSiteSuggestions.length > 0) setShowEditSiteSuggestions(true); }}
                />
                {showEditSiteSuggestions && editSiteSuggestions.length > 0 && (
                  <View style={styles.suggestionsBox}>
                    {editSiteSuggestions.map((s: any) => (
                      <Pressable key={s.place_id} style={styles.suggestionItem} onPress={() => selectSiteSuggestion(s.place_id, s.description, 'edit')}>
                        <Ionicons name="location-outline" size={16} color={Colors.textSecondary} />
                        <Text style={styles.suggestionText} numberOfLines={1}>{s.description}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                {editProjectSiteLat != null && (
                  <View style={styles.coordBadge}>
                    <Ionicons name="navigate" size={12} color={Colors.primary} />
                    <Text style={styles.coordText}>{editProjectSiteLat.toFixed(4)}, {editProjectSiteLng?.toFixed(4)}</Text>
                  </View>
                )}
                <Pressable
                  style={styles.dropPinBtn}
                  onPress={() => { editingProjectRef.current = editingProject; setEditingProject(null); setTimeout(() => setShowEditProjectMapPicker(true), 300); }}
                >
                  <Ionicons name="location" size={16} color={Colors.primary} />
                  <Text style={styles.dropPinBtnText}>Drop Pin on Map</Text>
                </Pressable>
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Awarded Amount</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 50000"
                  placeholderTextColor={Colors.textMuted}
                  value={editProjectAwarded}
                  onChangeText={setEditProjectAwarded}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Notes</Text>
                <TextInput
                  style={[styles.modalInput, { height: 72, textAlignVertical: 'top' }]}
                  placeholder="Optional project notes..."
                  placeholderTextColor={Colors.textMuted}
                  value={editProjectNotes}
                  onChangeText={setEditProjectNotes}
                  multiline
                />
              </View>

              <Pressable
                style={[styles.modalCreateBtn, !editProjectName.trim() && { opacity: 0.5 }]}
                onPress={handleUpdateProject}
                disabled={!editProjectName.trim() || updateProjectMutation.isPending}
              >
                {updateProjectMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.primaryForeground} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color={Colors.primaryForeground} />
                    <Text style={styles.modalCreateBtnText}>Save Changes</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={styles.deleteProjectBtn}
                onPress={handleDeleteProject}
                disabled={deleteProjectMutation.isPending}
              >
                {deleteProjectMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.destructive} />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={18} color={Colors.destructive} />
                    <Text style={styles.deleteProjectBtnText}>Delete Project</Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <LocationPickerModal
        visible={showNewProjectMapPicker}
        onClose={() => { setShowNewProjectMapPicker(false); setTimeout(() => setShowCreateProject(true), 300); }}
        onSelect={(result) => {
          setNewProjectSiteAddress(result.address);
          setNewProjectSiteLat(result.lat);
          setNewProjectSiteLng(result.lng);
        }}
        title="Pick Site Location"
        initialLat={newProjectSiteLat ?? undefined}
        initialLng={newProjectSiteLng ?? undefined}
        initialAddress={newProjectSiteAddress}
      />

      <LocationPickerModal
        visible={showEditProjectMapPicker}
        onClose={() => { setShowEditProjectMapPicker(false); if (editingProjectRef.current) { setTimeout(() => setEditingProject(editingProjectRef.current), 300); editingProjectRef.current = null; } }}
        onSelect={(result) => {
          setEditProjectSiteAddress(result.address);
          setEditProjectSiteLat(result.lat);
          setEditProjectSiteLng(result.lng);
        }}
        title="Pick Site Location"
        initialLat={editProjectSiteLat ?? undefined}
        initialLng={editProjectSiteLng ?? undefined}
        initialAddress={editProjectSiteAddress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 20,
    color: Colors.text,
    letterSpacing: 1.5,
    flex: 1,
    textAlign: 'center',
  },
  tabToggleRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 44,
  },
  tabToggleActive: {
    backgroundColor: Colors.primaryLight,
  },
  tabToggleText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.textMuted,
  },
  tabToggleTextActive: {
    color: Colors.primary,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.text,
    height: 44,
  },
  filterButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  chipRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  chipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.primary,
    fontFamily: 'Inter_600SemiBold',
  },
  dateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primaryLight,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  dateBannerText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.primary,
  },
  projectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primaryLight,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  projectBannerText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.primary,
  },
  truckFilterSection: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  truckFilterLabel: {
    fontFamily: 'ChakraPetch_600SemiBold',
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  truckFilterRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  truckChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  truckChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  truckChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  truckChipTextActive: {
    color: Colors.primary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: Colors.text,
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
    minHeight: 44,
  },
  emptyCreateBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.primaryForeground,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  cardContainer: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardPressed: {
    backgroundColor: Colors.cardHover,
    transform: [{ scale: 0.99 }],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  requirementsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  cardProjectName: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 11,
    color: Colors.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  cardMaterial: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.text,
  },
  urgentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  urgentText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  cardRate: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 18,
    color: Colors.primary,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.muted,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  badgeText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.textSecondary,
  },
  locationRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  locationDot: {
    alignItems: 'center',
    width: 12,
    paddingTop: 4,
  },
  dotGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  dotLine: {
    width: 1,
    height: 14,
    backgroundColor: Colors.border,
  },
  dotOrange: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  locationTexts: {
    flex: 1,
    gap: 8,
  },
  locationText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
  },
  timeAgoText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textMuted,
    marginLeft: 'auto',
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  projectCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  projectCardActions: {
    alignItems: 'center',
    gap: 8,
    paddingLeft: 10,
  },
  projectEditBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingRight: 20,
  },
  projectCardName: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 16,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  projectJobNumber: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  projectStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  projectStatusText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  projectDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  projectDetailText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  projectFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  projectStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  projectStatText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 1.5,
  },
  modalField: {
    marginBottom: 16,
  },
  modalLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  modalInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 44,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
    minHeight: 48,
  },
  modalCreateBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.primaryForeground,
  },
  deleteProjectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.destructive,
  },
  deleteProjectBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.destructive,
  },
  archivedToggle: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  archivedToggleActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  suggestionsBox: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 4,
    maxHeight: 160,
    overflow: 'hidden' as const,
    zIndex: 999,
    elevation: 10,
  },
  suggestionItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  suggestionText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.text,
  },
  coordBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginTop: 4,
  },
  coordText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.primary,
  },
  dropPinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    alignSelf: 'flex-start',
  },
  dropPinBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.primary,
  },
});
