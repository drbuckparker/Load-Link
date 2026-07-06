// Shared predicate for what counts as an "Open" job in the contractor views.
//
// Used by BOTH the dashboard "OPEN JOBS" stat (app/(tabs)/index.tsx) and the
// My Jobs > Open tab (app/jobs-browse.tsx) so the two always show the same
// number. Previously the dashboard counted every row with status === 'open',
// while the Open tab additionally hid past-dated and fully-crewed jobs — so the
// stat (e.g. 12) never matched what the user saw after tapping in (e.g. 5).
// Routing both through this one function keeps the count and the list in sync.
//
// Accepts either a raw DB job (snake_case, dual-keyed) or a mapped Job, reading
// each field with a snake/camel fallback so it works from either call site.
export function isOpenTabJob(job: any, callerId?: string | null): boolean {
  const status = String(job.status ?? '').toLowerCase();
  // The contractor "Open" list shows jobs that still need crews: 'open' plus the
  // 'accepted'/'pending' states the server returns for ?status=open. Anything
  // terminal (completed/cancelled) or already working (in_progress) is excluded.
  if (status !== 'open' && status !== 'accepted' && status !== 'pending') return false;

  const requested = Number(job.trucksNeeded ?? job.trucks_needed ?? 0) || 0;
  const assigned = Number(job.approvedAssignments ?? job.approved_assignments ?? 0) || 0;
  const contractorId = job.contractorId ?? job.contractor_id;
  const isOwn = !!callerId && String(contractorId) === String(callerId);
  // Fully-crewed jobs drop off Open unless they're the viewer's own posting.
  if (!isOwn && requested > 0 && assigned >= requested) return false;

  const scheduled = job.scheduledDate ?? job.scheduled_date;
  if (!scheduled) return true;

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const raw = String(scheduled);
  const dateStr = raw.length >= 10 ? raw.substring(0, 10) : raw;
  const days = parseFloat(String(job.estimatedDays ?? job.estimated_days ?? '1')) || 1;
  if (days <= 1) {
    return dateStr >= todayStr;
  }

  // Multi-day jobs stay Open until their (weekend-skipping) end date passes.
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  let added = 0;
  const cur = new Date(start);
  while (added < days - 1) {
    cur.setDate(cur.getDate() + 1);
    if (cur.getDay() !== 0 && cur.getDay() !== 6) added++;
  }
  const endStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
  return endStr >= todayStr;
}
