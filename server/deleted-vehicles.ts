export const deletedVehicleIds = new Set<string>();

export let jobSyncPaused = true;

export function pauseJobSync() {
  jobSyncPaused = true;
}

export function resumeJobSync() {
  jobSyncPaused = false;
}
