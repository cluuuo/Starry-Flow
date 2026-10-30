import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const script = path.join(root, 'monitor', 'monitor.py');
const outDir = path.join(root, 'monitor', 'dist');
const workDir = path.join(root, 'monitor', 'build');

if (!fs.existsSync(script)) {
  console.error('[build:monitor] 未找到 monitor.py:', script);
  process.exit(1);
}

const candidates = [
  process.env.STARRY_FLOW_PYTHON,
  'F:\\PYTHON\\python.exe',
  'python',
  'py'
].filter(Boolean);

let python = null;
for (const candidate of candidates) {
  const probe = spawnSync(candidate, ['-c', 'import psutil, win32gui, PyInstaller'], {
    encoding: 'utf8',
    windowsHide: true
  });
  if (probe.status === 0) {
    python = candidate;
    break;
  }
  console.warn(`[build:monitor] 跳过 ${candidate}：${(probe.stderr || probe.error?.message || '').trim().split('\n')[0]}`);
}

if (!python) {
  console.error('[build:monitor] 没有可用的 Python（需 psutil、pywin32、PyInstaller）');
  process.exit(1);
}

console.log(`[build:monitor] 使用 Python: ${python}`);
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(workDir, { recursive: true });

const args = [
  '-m', 'PyInstaller',
  '--noconfirm',
  '--clean',
  '--onefile',
  '--name', 'monitor',
  '--distpath', outDir,
  '--workpath', workDir,
  '--specpath', workDir,
  script
];

const result = spawnSync(python, args, { stdio: 'inherit', cwd: root, windowsHide: true });
if (result.status !== 0) {
  console.error('[build:monitor] PyInstaller 打包失败');
  process.exit(result.status || 1);
}

const exe = path.join(outDir, 'monitor.exe');
if (!fs.existsSync(exe)) {
  console.error('[build:monitor] 未生成 monitor.exe');
  process.exit(1);
}

const size = fs.statSync(exe).size;
console.log(`[build:monitor] 完成：${exe}（${(size / 1024 / 1024).toFixed(1)} MB）`);
