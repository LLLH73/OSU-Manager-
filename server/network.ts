import dns from 'node:dns';
import net from 'node:net';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import {
  Agent,
  ProxyAgent,
  buildConnector,
  fetch as undiciFetch,
  type RequestInit as UndiciRequestInit,
} from 'undici';
import { getConfig } from './config.js';
import { logInfo } from './logger.js';
import { MIRROR_DEFINITIONS, MIRROR_MAP } from './sources.js';
import {
  FastBatchRouteStrategy,
  IpFamilyMode,
  MirrorDefinition,
  MirrorHealth,
  MirrorId,
  NetworkStatus,
  PreferredMirror,
  RoutePolicy,
} from './types.js';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 osu-manager/1.10';

export const networkEvents = new EventEmitter();

const DNS_CACHE_TTL_MS = 5 * 60_000;
const dnsCache = new Map<string, { addresses: dns.LookupAddress[]; at: number }>();
const lastHostIpFamily = new Map<string, 4 | 6>();
const directAgents = new Map<IpFamilyMode, Agent>();

export function detectLocalGlobalIpv6(): boolean {
  try {
    const ifaces = os.networkInterfaces();
    for (const entries of Object.values(ifaces)) {
      if (!entries) continue;
      for (const info of entries) {
        if (info.internal) continue;
        const isV6 = info.family === 'IPv6' || (info.family as unknown) === 6;
        if (!isV6 || !info.address) continue;
        const addr = info.address.toLowerCase();
        if (addr === '::1' || addr.startsWith('fe80:') || addr.startsWith('fc') || addr.startsWith('fd')) {
          continue;
        }
        return true;
      }
    }
  } catch {
    // Ignore interface enumeration errors
  }
  return false;
}

export function getLastHostIpFamily(urlOrHost: string): 4 | 6 | null {
  if (!urlOrHost) return null;
  let host = urlOrHost.trim();
  if (host.includes('://')) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  }
  return lastHostIpFamily.get(host.toLowerCase()) ?? null;
}

function selectAddresses(
  allAddrs: dns.LookupAddress[],
  ipFamily: IpFamilyMode,
  requestedFamily?: number,
): dns.LookupAddress[] {
  const v6 = allAddrs.filter((a) => a.family === 6);
  const v4 = allAddrs.filter((a) => a.family === 4);

  if (ipFamily === 'ipv6_only') return v6;
  if (ipFamily === 'ipv4_only') return v4;
  if (ipFamily === 'ipv6_first') return [...v6, ...v4];
  if (ipFamily === 'ipv4_first') return [...v4, ...v6];
  if (requestedFamily === 6) return v6;
  if (requestedFamily === 4) return v4;
  return allAddrs;
}

function createIpFamilyLookup(ipFamily: IpFamilyMode) {
  return (
    hostname: string,
    options: dns.LookupOptions,
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | dns.LookupAddress[],
      family?: number,
    ) => void,
  ): void => {
    const cacheKey = hostname.toLowerCase();
    const deliver = (allAddrs: dns.LookupAddress[]) => {
      const requested = typeof options?.family === 'number' ? options.family : undefined;
      const filtered = selectAddresses(allAddrs, ipFamily, requested);
      if (filtered.length === 0) {
        const err: NodeJS.ErrnoException = new Error(
          `No matching ${ipFamily === 'ipv6_only' ? 'IPv6' : 'IPv4'} address for ${hostname}`,
        );
        err.code = 'ENOTFOUND';
        callback(err, options?.all ? [] : '', 0);
        return;
      }
      if (options?.all) {
        callback(null, filtered);
      } else {
        callback(null, filtered[0].address, filtered[0].family);
      }
    };

    const cached = dnsCache.get(cacheKey);
    if (cached && Date.now() - cached.at < DNS_CACHE_TTL_MS) {
      deliver(cached.addresses);
      return;
    }

    dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) {
        callback(err, options?.all ? [] : '', 0);
        return;
      }
      const normalized = Array.isArray(addresses) ? addresses : [];
      if (normalized.length > 0) {
        if (dnsCache.size > 256) {
          const oldest = dnsCache.keys().next().value;
          if (oldest !== undefined) dnsCache.delete(oldest);
        }
        dnsCache.set(cacheKey, { addresses: normalized, at: Date.now() });
      }
      deliver(normalized);
    });
  };
}

function getDirectAgent(ipFamily: IpFamilyMode): Agent {
  const existing = directAgents.get(ipFamily);
  if (existing) return existing;

  const autoSelect = ipFamily !== 'ipv6_only' && ipFamily !== 'ipv4_only';
  const baseConnector = buildConnector({
    timeout: 8000,
    keepAlive: true,
    keepAliveInitialDelay: 10_000,
    lookup: createIpFamilyLookup(ipFamily),
    autoSelectFamily: autoSelect,
    autoSelectFamilyAttemptTimeout: ipFamily === 'ipv6_first' ? 220 : 150,
  });

  const agent = new Agent({
    connections: 16,
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 120_000,
    headersTimeout: 15_000,
    bodyTimeout: 90_000,
    connect: (opts, cb) => {
      baseConnector(opts, (err, socket) => {
        if (err || !socket) {
          cb(err || new Error('Socket connection failed'), null);
          return;
        }
        if (opts.hostname) {
          const fam = socket.remoteFamily;
          if (fam === 'IPv6' || fam === 'IPv4') {
            if (lastHostIpFamily.size > 512) {
              const oldest = lastHostIpFamily.keys().next().value;
              if (oldest !== undefined) lastHostIpFamily.delete(oldest);
            }
            lastHostIpFamily.set(opts.hostname.toLowerCase(), fam === 'IPv6' ? 6 : 4);
          }
        }
        cb(null, socket);
      });
    },
  });

  directAgents.set(ipFamily, agent);
  return agent;
}

let proxyAgentKey = '';
let cachedProxyAgent: ProxyAgent | null = null;

function getProxyAgent(host: string, port: number): ProxyAgent {
  const key = `${host}:${port}`;
  if (!cachedProxyAgent || proxyAgentKey !== key) {
    proxyAgentKey = key;
    cachedProxyAgent = new ProxyAgent({
      uri: `http://${host}:${port}`,
      connections: 16,
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 120_000,
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

export async function resolveRoutes(
  policy: RoutePolicy,
  strategyOverride?: FastBatchRouteStrategy,
): Promise<Array<'direct' | 'proxy'>> {
  const cfg = getConfig();

  if (strategyOverride === 'direct_only') {
    return ['direct'];
  }
  if (strategyOverride === 'proxy_only') {
    return ['proxy'];
  }
  if (strategyOverride === 'direct_first') {
    if (cfg.proxyMode === 'direct' || policy === 'direct_only') return ['direct'];
    if (cfg.proxyMode === 'proxy' || policy === 'proxy_only') return ['proxy'];
    const proxyOpen = await isProxyListening();
    return proxyOpen ? ['direct', 'proxy'] : ['direct'];
  }

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
  init: Omit<UndiciRequestInit, 'dispatcher'> & { timeoutMs?: number; ipFamily?: IpFamilyMode } = {},
): Promise<Awaited<ReturnType<typeof undiciFetch>>> {
  const cfg = getConfig();
  const { timeoutMs = 12000, ipFamily, headers, signal, ...rest } = init;
  const resolvedIpFamily = ipFamily ?? cfg.ipFamily ?? 'auto';
  const dispatcher =
    route === 'proxy' ? getProxyAgent(cfg.proxyHost, cfg.proxyPort) : getDirectAgent(resolvedIpFamily);
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
    hasGlobalIpv6: detectLocalGlobalIpv6(),
    ipFamily: cfg.ipFamily ?? 'auto',
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
