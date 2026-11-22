import net from 'node:net';
import { EventEmitter } from 'node:events';
import { Agent, ProxyAgent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici';
import { getConfig } from './config.js';
import { logInfo } from './logger.js';
import { MIRROR_DEFINITIONS, MIRROR_MAP } from './sources.js';
import {
  MirrorDefinition,
  MirrorHealth,
  MirrorId,
  NetworkStatus,
  PreferredMirror,
  RoutePolicy,
} from './types.js';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 osu-4k-downloader/1.0';

export const networkEvents = new EventEmitter();

const directAgent = new Agent({
  connect: { timeout: 8000 },
  keepAliveTimeout: 15000,
});

let proxyAgentKey = '';
let cachedProxyAgent: ProxyAgent | null = null;

function getProxyAgent(host: string, port: number): ProxyAgent {
  const key = `${host}:${port}`;
  if (!cachedProxyAgent || proxyAgentKey !== key) {
    proxyAgentKey = key;
    cachedProxyAgent = new ProxyAgent({
      uri: `http://${host}:${port}`,
      connect: { timeout: 8000 },
    });
  }
  return cachedProxyAgent;
}

let proxyCheckCache: { open: boolean; key: string; at: number } | null = null;

export async function isProxyListening(force = false): Promise<boolean> {
  const cfg = getConfig();
  const key = `${cfg.proxyHost}:${cfg.proxyPort}`;
  if (!force && proxyCheckCache && proxyCheckCache.key === key && Date.now() - proxyCheckCache.at < 15000) {
    return proxyCheckCache.open;
  }

  const open = await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host: cfg.proxyHost, port: cfg.proxyPort });
    let done = false;
    const finish = (res: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(res);
    };
    socket.setTimeout(800);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });

  proxyCheckCache = { open, key, at: Date.now() };
  return open;
}

export interface SmartFetchResult {
  response: Awaited<ReturnType<typeof undiciFetch>>;
  routeUsed: 'direct' | 'proxy';
}

export async function resolveRoutes(policy: RoutePolicy): Promise<Array<'direct' | 'proxy'>> {
  const cfg = getConfig();
  if (cfg.proxyMode === 'direct' || policy === 'direct_only') {
    return ['direct'];
  }
  if (cfg.proxyMode === 'proxy' || policy === 'proxy_only') {
    return ['proxy'];
  }

  const proxyOpen = await isProxyListening();
  if (policy === 'cn_first') {
    return proxyOpen ? ['direct', 'proxy'] : ['direct'];
  }
  // global_first
  return proxyOpen ? ['proxy', 'direct'] : ['direct'];
}

export async function fetchWithRoute(
  url: string,
  route: 'direct' | 'proxy',
  init: Omit<UndiciRequestInit, 'dispatcher'> & { timeoutMs?: number } = {},
): Promise<Awaited<ReturnType<typeof undiciFetch>>> {
  const cfg = getConfig();
  const { timeoutMs = 12000, headers, signal, ...rest } = init;
  const dispatcher = route === 'proxy' ? getProxyAgent(cfg.proxyHost, cfg.proxyPort) : directAgent;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  return undiciFetch(url, {
    ...rest,
    dispatcher,
    signal: combinedSignal,
    headers: {
      'User-Agent': USER_AGENT,
      ...(headers as Record<string, string> | undefined),
    },
  });
}

export async function fetchSmart(
  url: string,
  init: Omit<UndiciRequestInit, 'dispatcher'> & { timeoutMs?: number } = {},
  policy: RoutePolicy = 'global_first',
): Promise<SmartFetchResult> {
  const routes = await resolveRoutes(policy);
  let lastError: unknown = null;

  for (const route of routes) {
    try {
      const response = await fetchWithRoute(url, route, init);
      if (response.status >= 500 && route !== routes[routes.length - 1]) {
        await response.body?.cancel().catch(() => {});
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      return { response, routeUsed: route };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Request failed'));
}

const mirrorHealthMap = new Map<MirrorId, MirrorHealth>(
  MIRROR_DEFINITIONS.map((m) => [
    m.id,
    {
      id: m.id,
      name: m.name,
      shortName: m.shortName,
      region: m.region,
      requiresAuth: m.requiresAuth,
      supportsVariants: m.supportsVariants,
      description: m.description,
      healthy: m.requiresAuth ? false : true,
      latencyMs: null,
      routeUsed: null,
      statusCode: null,
      lastChecked: null,
      error: null,
    },
  ]),
);

let lastBenchmarkAt: string | null = null;
let benchmarking = false;
let benchmarkPromise: Promise<NetworkStatus> | null = null;

async function probeOneMirror(def: MirrorDefinition): Promise<MirrorHealth> {
  const cfg = getConfig();
  const base: MirrorHealth = {
    id: def.id,
    name: def.name,
    shortName: def.shortName,
    region: def.region,
    requiresAuth: def.requiresAuth,
    supportsVariants: def.supportsVariants,
    description: def.description,
    healthy: false,
    latencyMs: null,
    routeUsed: null,
    statusCode: null,
    lastChecked: new Date().toISOString(),
    error: null,
  };

  if (def.id === 'official' && !cfg.officialCookie.trim()) {
    try {
      const t0 = Date.now();
      const { response, routeUsed } = await fetchSmart(
        def.probeUrl,
        { method: def.probeMethod, redirect: 'manual', timeoutMs: 5000 },
        def.routePolicy,
      );
      await response.body?.cancel().catch(() => {});
      return {
        ...base,
        healthy: false,
        latencyMs: Date.now() - t0,
        routeUsed,
        statusCode: response.status,
        error: '未配置 osu_session Cookie（镜像站无需登录，已自动改用镜像）',
      };
    } catch (err) {
      return {
        ...base,
        error: err instanceof Error ? err.message : '官方源不可达',
      };
    }
  }

  const routes = await resolveRoutes(def.routePolicy);
  let lastErr = '';
  for (const route of routes) {
    const t0 = Date.now();
    try {
      const headers: Record<string, string> = {};
      if (def.id === 'official' && cfg.officialCookie.trim()) {
        const rawCookie = cfg.officialCookie.trim();
        headers.Cookie = rawCookie.includes('=') ? rawCookie : `osu_session=${rawCookie}`;
      }
      const response = await fetchWithRoute(def.probeUrl, route, {
        method: def.probeMethod,
        redirect: 'manual',
        timeoutMs: 6000,
        headers,
      });
      await response.body?.cancel().catch(() => {});
      const latencyMs = Date.now() - t0;
      const ok = response.status >= 200 && response.status < 400;
      if (ok) {
        return {
          ...base,
          healthy: true,
          latencyMs,
          routeUsed: route,
          statusCode: response.status,
          error: null,
        };
      }
      lastErr = `HTTP ${response.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    ...base,
    healthy: false,
    error: lastErr || '探测超时或失败',
  };
}

export async function benchmarkMirrors(forceProxyRefresh = true): Promise<NetworkStatus> {
  if (benchmarkPromise) return benchmarkPromise;

  benchmarking = true;
  networkEvents.emit('update', getNetworkStatusSync(false));

  benchmarkPromise = (async () => {
    try {
      await isProxyListening(forceProxyRefresh);
      const results = await Promise.all(MIRROR_DEFINITIONS.map((m) => probeOneMirror(m)));
      for (const res of results) {
        mirrorHealthMap.set(res.id, res);
      }
      lastBenchmarkAt = new Date().toISOString();
    } finally {
      benchmarking = false;
      benchmarkPromise = null;
    }
    const status = await getNetworkStatus(false);
    const best = status.mirrors.find((m) => m.id === status.recommendedMirror);
    logInfo('network', 'Mirror benchmark completed', {
      proxyOpen: status.proxyOpen,
      proxyPort: status.proxyPort,
      recommendedMirror: status.recommendedMirror,
      latencyMs: best?.latencyMs ?? null,
    });
    networkEvents.emit('update', status);
    return status;
  })();

  return benchmarkPromise;
}

function scoreMirror(health: MirrorHealth): number {
  if (!health.healthy) return 1_000_000;
  const lat = health.latencyMs ?? 1500;
  const cnBonus = health.region === 'CN' && health.routeUsed === 'direct' ? -80 : 0;
  return lat + cnBonus;
}

export function getRankedMirrors(preferred: PreferredMirror = 'auto'): MirrorDefinition[] {
  const cfg = getConfig();
  const hasCookie = Boolean(cfg.officialCookie.trim());

  let candidates = MIRROR_DEFINITIONS.filter((m) => {
    if (m.requiresAuth && !hasCookie && preferred !== m.id) return false;
    return true;
  });

  candidates.sort((a, b) => {
    const ha = mirrorHealthMap.get(a.id)!;
    const hb = mirrorHealthMap.get(b.id)!;
    return scoreMirror(ha) - scoreMirror(hb);
  });

  if (preferred !== 'auto') {
    const prefDef = MIRROR_MAP.get(preferred);
    if (prefDef) {
      candidates = [prefDef, ...candidates.filter((c) => c.id !== preferred)];
    }
  }

  return candidates;
}

function getNetworkStatusSync(proxyOpen: boolean): NetworkStatus {
  const cfg = getConfig();
  const mirrors = MIRROR_DEFINITIONS.map((d) => mirrorHealthMap.get(d.id)!);
  const ranked = getRankedMirrors('auto');
  const firstHealthy = ranked.find((m) => mirrorHealthMap.get(m.id)?.healthy);

  const effectiveProxyActive =
    cfg.proxyMode === 'proxy' ? true : cfg.proxyMode === 'direct' ? false : proxyOpen;

  return {
    proxyOpen,
    proxyHost: cfg.proxyHost,
    proxyPort: cfg.proxyPort,
    proxyMode: cfg.proxyMode,
    effectiveProxyActive,
    lastChecked: lastBenchmarkAt,
    benchmarking,
    recommendedMirror: firstHealthy?.id ?? null,
    mirrors,
  };
}

export async function getNetworkStatus(refreshProxy = false): Promise<NetworkStatus> {
  const proxyOpen = await isProxyListening(refreshProxy);
  return getNetworkStatusSync(proxyOpen);
}

export function resetProxyCache(): void {
  proxyCheckCache = null;
}
