import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { execFileSync } from 'node:child_process';

function parseArgs(argv) {
  const opts = {
    repo: '',
    tag: '',
    name: '',
    notesFile: '',
    targetCommitish: 'main',
    assets: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--repo' && next) {
      opts.repo = next.trim();
      i += 1;
    } else if (arg === '--tag' && next) {
      opts.tag = next.trim();
      i += 1;
    } else if (arg === '--name' && next) {
      opts.name = next.trim();
      i += 1;
    } else if (arg === '--notes-file' && next) {
      opts.notesFile = next.trim();
      i += 1;
    } else if (arg === '--target' && next) {
      opts.targetCommitish = next.trim();
      i += 1;
    } else if (arg === '--asset' && next) {
      opts.assets.push(next.trim());
      i += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  if (!opts.repo || !opts.repo.includes('/')) {
    throw new Error('Missing or invalid --repo <owner>/<repo>');
  }
  if (!opts.tag) {
    throw new Error('Missing --tag <tag>');
  }
  return opts;
}

function resolveGitHubToken(repoSlug) {
  const envToken = (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '').trim();
  if (envToken) return envToken;

  const filled = execFileSync('git', ['credential', 'fill'], {
    input: `protocol=https\nhost=github.com\npath=${repoSlug}.git\n\n`,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  for (const line of filled.split(/\r?\n/)) {
    const idx = line.indexOf('=');
    if (idx > 0 && line.slice(0, idx) === 'password') {
      const token = line.slice(idx + 1).trim();
      if (token) return token;
    }
  }
  throw new Error('Unable to acquire GitHub token from GH_TOKEN, GITHUB_TOKEN, or git credential fill.');
}

async function githubJson(url, token, { method = 'GET', body, accept404 = false } = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'osu-manager-release-publisher/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json; charset=utf-8';
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  if (accept404 && res.status === 404) {
    return { status: 404, data: null };
  }
  const text = await res.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    throw new Error(
      `GitHub API ${method} ${url} failed with HTTP ${res.status}: ${
        typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
      }`,
    );
  }
  return { status: res.status, data: parsed };
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function uploadReleaseAsset({ owner, repo, releaseId, filePath, token }) {
  const fileName = path.basename(filePath);
  const stat = fs.statSync(filePath);
  const totalBytes = stat.size;
  const contentType = fileName.toLowerCase().endsWith('.txt')
    ? 'text/plain; charset=utf-8'
    : 'application/octet-stream';

  const uploadUrl = new URL(
    `https://uploads.github.com/repos/${owner}/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(fileName)}`,
  );

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    const req = https.request(
      uploadUrl,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'osu-manager-release-publisher/1.0',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': contentType,
          'Content-Length': totalBytes,
        },
        timeout: 15 * 60 * 1000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = raw;
          }
          if ((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300) {
            settled = true;
            resolve(parsed);
          } else {
            fail(
              new Error(
                `Upload failed for ${fileName} with HTTP ${res.statusCode}: ${
                  typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
                }`,
              ),
            );
          }
        });
      },
    );

    const stream = fs.createReadStream(filePath);
    let sentBytes = 0;
    let lastLoggedPct = -1;
    let lastLogAt = Date.now();

    req.on('timeout', () => {
      stream.destroy();
      req.destroy(new Error(`Upload timed out after 15 minutes for ${fileName}`));
    });

    req.on('error', (err) => {
      stream.destroy();
      const proxyHint =
        !process.env.HTTPS_PROXY && !process.env.HTTP_PROXY
          ? ' (HTTPS_PROXY is not set; check network connectivity or set HTTPS_PROXY)'
          : '';
      fail(new Error(`Network error uploading ${fileName}: ${err.message}${proxyHint}`));
    });

    stream.on('error', (err) => {
      req.destroy(err);
      fail(new Error(`File read error for ${filePath}: ${err.message}`));
    });

    stream.on('data', (chunk) => {
      sentBytes += chunk.length;
      const pct = totalBytes > 0 ? Math.floor((sentBytes * 100) / totalBytes) : 100;
      const now = Date.now();
      if (pct >= lastLoggedPct + 15 || now - lastLogAt >= 3000 || sentBytes === totalBytes) {
        lastLoggedPct = pct;
        lastLogAt = now;
        console.log(`  -> ${fileName}: ${formatMb(sentBytes)} / ${formatMb(totalBytes)} (${pct}%)`);
      }
    });

    stream.pipe(req);
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const [owner, repo] = opts.repo.split('/', 2);
  if (!owner || !repo) {
    throw new Error(`Invalid repository slug: ${opts.repo}`);
  }

  const resolvedAssets = opts.assets.map((assetPath) => {
    const abs = path.resolve(assetPath);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      throw new Error(`Missing release asset file: ${abs}`);
    }
    return abs;
  });

  const body = opts.notesFile
    ? fs.readFileSync(path.resolve(opts.notesFile), 'utf8').replace(/\r\n/g, '\n')
    : '';
  const releaseTitle = opts.name || opts.tag;
  const token = resolveGitHubToken(`${owner}/${repo}`);

  const tagApiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(opts.tag)}`;
  const existing = await githubJson(tagApiUrl, token, { accept404: true });

  let release;
  if (existing.status === 404) {
    const createUrl = `https://api.github.com/repos/${owner}/${repo}/releases`;
    const created = await githubJson(createUrl, token, {
      method: 'POST',
      body: {
        tag_name: opts.tag,
        target_commitish: opts.targetCommitish,
        name: releaseTitle,
        body,
        draft: false,
        prerelease: false,
      },
    });
    release = created.data;
    console.log(`[release] Created ${release.tag_name} (id=${release.id})`);
  } else {
    const patchUrl = `https://api.github.com/repos/${owner}/${repo}/releases/${existing.data.id}`;
    const patched = await githubJson(patchUrl, token, {
      method: 'PATCH',
      body: {
        name: releaseTitle,
        body,
        draft: false,
        prerelease: false,
      },
    });
    release = patched.data;
    console.log(`[release] Updated existing ${release.tag_name} (id=${release.id})`);

    const uploadNames = new Set(resolvedAssets.map((p) => path.basename(p)));
    const existingAssets = Array.isArray(release.assets) ? release.assets : [];
    for (const asset of existingAssets) {
      if (uploadNames.has(asset.name)) {
        const delUrl = `https://api.github.com/repos/${owner}/${repo}/releases/assets/${asset.id}`;
        await githubJson(delUrl, token, { method: 'DELETE' });
        console.log(`[release] Deleted existing asset ${asset.name} (id=${asset.id})`);
      }
    }
  }

  for (const filePath of resolvedAssets) {
    console.log(`[upload] Starting ${path.basename(filePath)}...`);
    await uploadReleaseAsset({
      owner,
      repo,
      releaseId: release.id,
      filePath,
      token,
    });
  }

  const verified = await githubJson(tagApiUrl, token);
  const finalRelease = verified.data;
  console.log(`[done] Release URL: ${finalRelease.html_url}`);
  for (const asset of finalRelease.assets || []) {
    console.log(
      `  asset: ${asset.name} | size=${asset.size} | state=${asset.state} | url=${asset.browser_download_url}`,
    );
  }
}

main().catch((err) => {
  console.error(`[publish-github-release] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
