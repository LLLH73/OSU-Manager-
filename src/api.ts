import {
  AppConfig,
  DownloadTarget,
  DownloadTask,
  DownloadVariant,
  LibraryDiffResult,
  LocalLibraryStatus,
  NetworkStatus,
  NormalizedBeatmapset,
  ParsedManiaChart,
  PreferredMirror,
  PreviewBeatmapsetResponse,
  ResolvedManiaSkin,
  SearchFilters,
  SearchResult,
  SkinsListResponse,
} from './types';

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error((errBody as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchConfig(): Promise<AppConfig> {
  return apiJson<AppConfig>('/api/config');
}

export function updateConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  return apiJson<AppConfig>('/api/config', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function fetchNetworkStatus(refresh = false): Promise<NetworkStatus> {
  return apiJson<NetworkStatus>(`/api/network/status?refresh=${refresh}`);
}

export function runNetworkBenchmark(): Promise<NetworkStatus> {
  return apiJson<NetworkStatus>('/api/network/benchmark', { method: 'POST' });
}

export function searchBeatmapsets(filters: SearchFilters): Promise<SearchResult> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  return apiJson<SearchResult>(`/api/search?${params.toString()}`);
}

export function fetchBeatmapsetDetail(id: number): Promise<NormalizedBeatmapset> {
  return apiJson<NormalizedBeatmapset>(`/api/beatmapset/${id}`);
}

export function fetchLibraryStatus(refresh = false): Promise<LocalLibraryStatus> {
  return apiJson<LocalLibraryStatus>(`/api/library/status?refresh=${refresh}`);
}

export function rescanLocalLibrary(): Promise<LocalLibraryStatus> {
  return apiJson<LocalLibraryStatus>('/api/library/rescan', { method: 'POST' });
}

export function fetchLibraryDiff(): Promise<LibraryDiffResult> {
  return apiJson<LibraryDiffResult>('/api/library/diff');
}

export function syncStableToLazer(setIds: number[]): Promise<{
  syncedCount: number;
  failed: Array<{ setId: number; reason: string }>;
  triggeredIpc: boolean;
}> {
  return apiJson('/api/library/sync-to-lazer', {
    method: 'POST',
    body: JSON.stringify({ setIds }),
  });
}

export function openLocalFolder(which: 'stableSongs' | 'stableRoot' | 'lazerData' | 'lazerImport'): Promise<{ ok: boolean }> {
  return apiJson('/api/library/open-folder', {
    method: 'POST',
    body: JSON.stringify({ which }),
  });
}

export function importLazerPending(filenames?: string[]): Promise<{
  launched: boolean;
  count: number;
  message: string;
}> {
  return apiJson('/api/lazer/import-pending', {
    method: 'POST',
    body: JSON.stringify({ filenames }),
  });
}

export function clearLazerPending(filenames?: string[]): Promise<{ deletedCount: number }> {
  return apiJson('/api/lazer/pending', {
    method: 'DELETE',
    body: JSON.stringify({ filenames }),
  });
}

export function fetchDownloads(): Promise<DownloadTask[]> {
  return apiJson<DownloadTask[]>('/api/downloads');
}

export function enqueueDownload(payload: {
  beatmapsetId: number;
  title?: string;
  artist?: string;
  creator?: string;
  target?: DownloadTarget;
  variant?: DownloadVariant;
  preferredMirror?: PreferredMirror;
}): Promise<DownloadTask> {
  return apiJson<DownloadTask>('/api/downloads', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function enqueueBatchDownloads(payload: {
  items: Array<{ beatmapsetId: number; title?: string; artist?: string; creator?: string }>;
  target?: DownloadTarget;
  variant?: DownloadVariant;
  preferredMirror?: PreferredMirror;
}): Promise<{ count: number; tasks: DownloadTask[] }> {
  return apiJson('/api/downloads/batch', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function cancelDownloadTask(id: string): Promise<DownloadTask> {
  return apiJson<DownloadTask>(`/api/downloads/${id}/cancel`, { method: 'POST' });
}

export function retryDownloadTask(id: string): Promise<DownloadTask> {
  return apiJson<DownloadTask>(`/api/downloads/${id}/retry`, { method: 'POST' });
}

export function clearFinishedDownloadTasks(): Promise<{ removed: number }> {
  return apiJson('/api/downloads/completed', { method: 'DELETE' });
}

export function fetchPreviewBeatmapset(setId: number): Promise<PreviewBeatmapsetResponse> {
  return apiJson<PreviewBeatmapsetResponse>(`/api/preview/beatmapset/${setId}`);
}

export function fetchParsedManiaChart(setId: number, index: number): Promise<ParsedManiaChart> {
  return apiJson<ParsedManiaChart>(`/api/preview/beatmapset/${setId}/chart/${index}`);
}

export function fetchSkinsList(): Promise<SkinsListResponse> {
  return apiJson<SkinsListResponse>('/api/skins');
}

export function fetchResolvedManiaSkin(skinId: string, keys: number): Promise<ResolvedManiaSkin> {
  return apiJson<ResolvedManiaSkin>(
    `/api/skins/${encodeURIComponent(skinId)}/mania?keys=${Math.max(1, Math.round(keys))}`,
  );
}

export function loadBeatmapIntoGame(
  beatmapsetId: number,
  client: 'auto' | 'lazer' | 'stable' = 'auto',
): Promise<{ ok: boolean; client: 'lazer' | 'stable' | null; message: string }> {
  return apiJson('/api/game/load', {
    method: 'POST',
    body: JSON.stringify({ beatmapsetId, client }),
  });
}
