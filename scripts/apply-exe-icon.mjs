import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = String(pkg.version || '1.9.0');
const exePath = path.join(rootDir, 'release', 'win-unpacked', 'osu-4k-downloader.exe');
const icoPath = path.join(rootDir, 'build', 'icon.ico');
const rceditPath = path.join(rootDir, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe');

if (!fs.existsSync(exePath)) {
  throw new Error(`Missing packaged executable: ${exePath}`);
}
if (!fs.existsSync(icoPath)) {
  throw new Error(`Missing icon file: ${icoPath}`);
}
if (!fs.existsSync(rceditPath)) {
  throw new Error(`Missing rcedit binary: ${rceditPath}`);
}

execFileSync(
  rceditPath,
  [
    exePath,
    '--set-icon',
    icoPath,
    '--set-version-string',
    'ProductName',
    'OSU!Manager!',
    '--set-version-string',
    'FileDescription',
    'OSU!Manager!',
    '--set-file-version',
    version,
    '--set-product-version',
    version,
  ],
  { stdio: 'inherit' },
);

console.log(`[apply-exe-icon] Embedded OM icon and v${version} metadata into ${exePath}`);
