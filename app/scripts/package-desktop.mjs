import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staging = mkdtempSync(path.join(tmpdir(), 'baiguan-desktop-'));
const desktopPackage = JSON.parse(readFileSync(path.join(root, 'desktop/package.json'), 'utf8'));

desktopPackage.build.directories.output = path.join(root, 'release');
desktopPackage.build.extraResources[0].from = path.join(root, 'dist');
desktopPackage.build.mac.icon = path.join(root, 'public/app-icon.png');

writeFileSync(path.join(staging, 'package.json'), `${JSON.stringify(desktopPackage, null, 2)}\n`);
cpSync(path.join(root, 'desktop/main.mjs'), path.join(staging, 'main.mjs'));
cpSync(path.join(root, 'desktop/pnpm-lock.yaml'), path.join(staging, 'pnpm-lock.yaml'));

const builder = path.join(root, 'node_modules/electron-builder/cli.js');
const target = process.argv.includes('--dmg') ? ['--mac'] : ['--mac', 'dir'];
const result = spawnSync(process.execPath, [builder, ...target], {
    cwd: staging,
    stdio: 'inherit',
    env: process.env,
});

rmSync(staging, { recursive: true, force: true });
process.exit(result.status ?? 1);
