export const deletedVehicleIds = new Set<string>();

export let jobSyncPaused = false;

export function pauseJobSync() {
  jobSyncPaused = true;
}

export function resumeJobSync() {
  jobSyncPaused = false;
}
