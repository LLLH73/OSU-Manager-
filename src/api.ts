import {
  AppConfig,
  BookDetail,
  BookRhythmData,
  BooksLibraryResponse,
  DownloadTarget,
  DownloadTask,
  DownloadVariant,
  FastBatchSnapshot,
  FastBatchStartOptions,
  FilterArchive,
  FilterArchiveBrowsePosition,
  LibraryDiffResult,
  LocalLibraryStatus,
  MusicPlaylist,
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

export function uploadCustomBackground(payload: {
  filePath?: string;
  dataUrl?: string;
  url?: string;
}): Promise<AppConfig> {
  return apiJson<AppConfig>('/api/config/background', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function clearCustomBackground(): Promise<AppConfig> {
  return apiJson<AppConfig>('/api/config/background', {
    method: 'DELETE',
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

export function launchGameClient(client: 'stable' | 'lazer'): Promise<{
  ok: boolean;
  client: 'stable' | 'lazer';
  alreadyRunning?: boolean;
  exePath?: string;
  message: string;
}> {
  return apiJson('/api/game/launch', {
    method: 'POST',
    body: JSON.stringify({ client }),
  });
}

export function fetchFastBatchStatus(): Promise<FastBatchSnapshot> {
  return apiJson<FastBatchSnapshot>('/api/fast-batch/status');
}

export function startFastBatch(
  options: Partial<FastBatchStartOptions>,
): Promise<FastBatchSnapshot> {
  return apiJson<FastBatchSnapshot>('/api/fast-batch/start', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export function pauseFastBatch(): Promise<FastBatchSnapshot> {
  return apiJson<FastBatchSnapshot>('/api/fast-batch/pause', { method: 'POST' });
}

export function resumeFastBatch(): Promise<FastBatchSnapshot> {
  return apiJson<FastBatchSnapshot>('/api/fast-batch/resume', { method: 'POST' });
}

export function stopFastBatch(): Promise<FastBatchSnapshot> {
  return apiJson<FastBatchSnapshot>('/api/fast-batch/stop', { method: 'POST' });
}

export function clearFastBatch(): Promise<FastBatchSnapshot> {
  return apiJson<FastBatchSnapshot>('/api/fast-batch/clear', { method: 'POST' });
}

export function fetchFilterArchives(): Promise<FilterArchive[]> {
  return apiJson<FilterArchive[]>('/api/filter-archives');
}

export function createFilterArchive(payload: {
  name: string;
  filters: SearchFilters;
  browsePosition?: FilterArchiveBrowsePosition | null;
  pinned?: boolean;
}): Promise<FilterArchive> {
  return apiJson<FilterArchive>('/api/filter-archives', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateFilterArchive(
  id: string,
  patch: {
    name?: string;
    filters?: SearchFilters;
    browsePosition?: FilterArchiveBrowsePosition | null;
    pinned?: boolean;
  },
): Promise<FilterArchive> {
  return apiJson<FilterArchive>(`/api/filter-archives/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function deleteFilterArchive(id: string): Promise<{ ok: boolean; id: string }> {
  return apiJson<{ ok: boolean; id: string }>(`/api/filter-archives/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function fetchLocalBooks(refresh = false): Promise<BooksLibraryResponse> {
  return apiJson<BooksLibraryResponse>(`/api/books${refresh ? '?refresh=true' : ''}`);
}

export function fetchLocalBookDetail(bookKey: string): Promise<BookDetail> {
  return apiJson<BookDetail>(`/api/books/${encodeURIComponent(bookKey)}`);
}

export function openStableSongFolder(subFolder: string): Promise<{ ok: boolean; path?: string }> {
  return apiJson('/api/library/open-folder', {
    method: 'POST',
    body: JSON.stringify({ which: 'stableSongs', subFolder }),
  });
}

export function fetchBookRhythm(bookKey: string): Promise<BookRhythmData> {
  return apiJson<BookRhythmData>(`/api/books/${encodeURIComponent(bookKey)}/rhythm`);
}

export function fetchPlaylists(): Promise<MusicPlaylist[]> {
  return apiJson<MusicPlaylist[]>('/api/playlists');
}

export function createPlaylist(payload: {
  name?: string;
  description?: string;
  coverBookKey?: string | null;
  bookKeys?: string[];
  pinned?: boolean;
}): Promise<MusicPlaylist> {
  return apiJson<MusicPlaylist>('/api/playlists', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updatePlaylist(
  id: string,
  patch: {
    name?: string;
    description?: string;
    coverBookKey?: string | null;
    bookKeys?: string[];
    pinned?: boolean;
  },
): Promise<MusicPlaylist> {
  return apiJson<MusicPlaylist>(`/api/playlists/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function deletePlaylist(id: string): Promise<{ ok: boolean; id: string }> {
  return apiJson<{ ok: boolean; id: string }>(`/api/playlists/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
