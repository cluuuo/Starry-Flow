const { app, BrowserWindow, ipcMain, dialog, screen, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

// 开发模式：npm run dev 会带 --dev；打包后必然不成立
const isDev = process.argv.includes('--dev') || !app.isPackaged;

let mainWindow = null;

// 第二个实例被唤起时，把已有窗口拉回可见状态；窗口对象丢失时重建，避免“有进程没界面”
function focusExistingWindow() {
  if (!appState) return;
  if (currentMode === 'mini') {
    setWindowMode('compact');
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow(appState.mainMode);
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.moveTop();
}

// 单实例锁：星空动画持续占用 GPU，重复启动会让占用成倍叠加，必须拦住
function bindSingleInstance() {
  app.on('second-instance', () => focusExistingWindow());
}

// 某些 Windows 环境下 app.getPath('localAppData') 即使 ready 后也会抛错，
// 这里优先走 API，失败则回退到环境变量 / 用户目录拼装。
function getLocalAppData() {
  try {
    return app.getPath('localAppData');
  } catch (e) {
    const fallback = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    console.log('[main] localAppData API 失败，回退到:', fallback);
    return fallback;
  }
}

let BASE_DIR;          // 固定配置目录：storage.json / settings.json / 日志
let STORAGE_FILE;
let DATA_DIR;          // 专注数据目录（积分、额度、指令队列）
let SETTINGS_FILE;
let MONITOR_FILE;
let FOCUS_FILE;
let COMMAND_DIR;
let MARKS_FILE;
let MARKS_DIR;
let ACHIEVEMENTS_FILE;
let WINDOW_STATE_FILE;

// storage.json 只记录用户改过路径的项，留空即使用默认目录
function readStorageOptions() {
  const saved = readJsonSafe(STORAGE_FILE);
  const pick = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  return {
    focusDir: saved ? pick(saved.focusDir) : '',
    marksFileDir: saved ? pick(saved.marksFileDir) : '',
    marksImageDir: saved ? pick(saved.marksImageDir) : ''
  };
}

function resolveStorage(opts) {
  const focusDir = opts.focusDir || BASE_DIR;
  const marksFileDir = opts.marksFileDir || BASE_DIR;
  return {
    focusDir,
    focusFile: path.join(focusDir, 'focus-data.json'),
    monitorFile: path.join(focusDir, 'monitor-data.json'),
    commandDir: path.join(focusDir, 'focus-commands'),
    marksFile: path.join(marksFileDir, 'marks.json'),
    marksImageDir: opts.marksImageDir || path.join(BASE_DIR, 'marks')
  };
}

// 把解析结果写入全局变量，运行期一律读这些变量
function applyStorage(resolved) {
  DATA_DIR = resolved.focusDir;
  FOCUS_FILE = resolved.focusFile;
  MONITOR_FILE = resolved.monitorFile;
  COMMAND_DIR = resolved.commandDir;
  MARKS_FILE = resolved.marksFile;
  MARKS_DIR = resolved.marksImageDir;
}

function initPaths() {
  BASE_DIR = path.join(getLocalAppData(), 'StarryFlow');
  STORAGE_FILE = path.join(BASE_DIR, 'storage.json');
  SETTINGS_FILE = path.join(BASE_DIR, 'settings.json');
  ACHIEVEMENTS_FILE = path.join(BASE_DIR, 'achievements.json');
  WINDOW_STATE_FILE = path.join(BASE_DIR, 'window-state.json');
  applyStorage(resolveStorage(readStorageOptions()));
  console.log('[main] BASE_DIR =', BASE_DIR, '| DATA_DIR =', DATA_DIR);
}

function ensureDataDir() {
  [BASE_DIR, DATA_DIR, MARKS_DIR].filter(Boolean).forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}


function readJsonSafe(file) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (e) {
    console.error('读取 JSON 失败:', file, e);
  }
  return null;
}

function writeJsonSafe(file, obj) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    console.error('写入 JSON 失败:', file, e);
    return false;
  }
}

function ensureMarksDir() {
  if (!fs.existsSync(MARKS_DIR)) {
    fs.mkdirSync(MARKS_DIR, { recursive: true });
  }
}

// 只按 basename 取文件，避免外部路径混入
function markFilePath(name) {
  return path.join(MARKS_DIR, path.basename(String(name)));
}

function removeMarkImage(name) {
  try {
    if (!name) return;
    const p = markFilePath(name);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (e) {
    console.error('删除印痕图片失败:', e);
  }
}

// ---------- 备份快照与恢复 ----------
// format 2：在 1 的基础上带上印痕图片与完整专注状态，可在全新设备上原样还原
const BACKUP_FORMAT = 2;

function collectMarkImages(marks) {
  const images = {};
  Object.values(marks || {}).forEach((mark) => {
    const file = mark && typeof mark.image === 'string' ? mark.image : '';
    if (!file || images[file]) return;
    try {
      const p = markFilePath(file);
      if (fs.existsSync(p)) {
        images[file] = { mime: 'image/jpeg', data: fs.readFileSync(p).toString('base64') };
      }
    } catch (e) {
      console.error('读取印痕图片失败:', file, e);
    }
  });
  return images;
}

// includeImages=false 时只带印痕文字，图片留在本地（云备份可选，节省流量）
// 同时去掉 image 字段，避免恢复后指向新设备上并不存在的图片
function buildBackupPayload(includeImages = true) {
  const marks = readJsonSafe(MARKS_FILE) || {};
  const marksOut = includeImages
    ? marks
    : Object.fromEntries(Object.entries(marks).map(([key, mark]) => [
      key,
      { ...(mark && typeof mark === 'object' ? mark : {}), image: null }
    ]));
  return {
    app: 'Starry Flow',
    format: BACKUP_FORMAT,
    version: app.getVersion(),
    exported_at: new Date().toISOString(),
    focus: readJsonSafe(FOCUS_FILE),
    settings: readJsonSafe(SETTINGS_FILE),
    marks: marksOut,
    marksImages: includeImages ? collectMarkImages(marks) : {},
    achievements: readJsonSafe(ACHIEVEMENTS_FILE)
  };
}

// 本地导入与云端恢复共用：写入文件 + 让采集端整体替换专注数据
function applyBackupPayload(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const focus = obj.focus || (obj.cumulative_points !== undefined ? obj : null);
  if (!focus || focus.cumulative_points === undefined) {
    return { ok: false, error: '不是有效的备份文件' };
  }
  if (obj.settings && typeof obj.settings === 'object') {
    writeJsonSafe(SETTINGS_FILE, obj.settings);
  }
  if (obj.marks && typeof obj.marks === 'object') {
    writeJsonSafe(MARKS_FILE, obj.marks);
  }
  // 旧备份没有成就存档，存在时才覆盖，避免清空已有纪念章
  if (obj.achievements && typeof obj.achievements === 'object') {
    writeJsonSafe(ACHIEVEMENTS_FILE, obj.achievements);
  }
  const images = obj.marksImages && typeof obj.marksImages === 'object' ? obj.marksImages : {};
  let imageCount = 0;
  if (Object.keys(images).length) {
    ensureMarksDir();
    Object.entries(images).forEach(([file, item]) => {
      try {
        const data = item && typeof item === 'object' ? item.data : item;
        if (typeof data !== 'string' || !data) return;
        fs.writeFileSync(markFilePath(file), Buffer.from(data, 'base64'));
        imageCount += 1;
      } catch (e) {
        console.error('写入印痕图片失败:', file, e);
      }
    });
  }
  enqueueFocusCommand('import', { data: focus });
  return {
    ok: true,
    settings: readJsonSafe(SETTINGS_FILE),
    summary: {
      days: Object.keys(focus.days || {}).length,
      cumulative: focus.cumulative_points,
      images: imageCount
    }
  };
}

// ---------- WebDAV 云备份 ----------
const WEBDAV_TIMEOUT = 15000;
const DAV_PROPFIND_0 = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>';
const DAV_PROPFIND_1 = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>';

function webdavStorePath() {
  return path.join(BASE_DIR, 'webdav.json');
}

function readWebdavConfig() {
  const saved = readJsonSafe(webdavStorePath()) || {};
  let password = '';
  try {
    if (typeof saved.password === 'string' && saved.password) {
      const buf = Buffer.from(saved.password, 'base64');
      password = saved.encrypted ? safeStorage.decryptString(buf) : buf.toString('utf-8');
    }
  } catch (e) {
    console.error('读取 WebDAV 密码失败:', e);
    password = '';
  }
  return {
    url: typeof saved.url === 'string' ? saved.url : '',
    username: typeof saved.username === 'string' ? saved.username : '',
    password,
    // 印痕图片体积占备份九成以上，默认随备份上传，可关闭以节省流量
    includeImages: saved.includeImages !== false
  };
}

// 密码用系统凭据加密（Windows 走 DPAPI）；传空字符串表示沿用已保存的密码
function saveWebdavConfig(patch) {
  const prev = readWebdavConfig();
  const src = patch && typeof patch === 'object' ? patch : {};
  const next = {
    url: typeof src.url === 'string' ? src.url.trim() : prev.url,
    username: typeof src.username === 'string' ? src.username.trim() : prev.username,
    password: typeof src.password === 'string' && src.password ? src.password : prev.password,
    includeImages: src.includeImages === undefined ? prev.includeImages : src.includeImages === true
  };
  let encrypted = false;
  let password = '';
  if (next.password) {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        password = safeStorage.encryptString(next.password).toString('base64');
        encrypted = true;
      } else {
        password = Buffer.from(next.password, 'utf-8').toString('base64');
      }
    } catch (e) {
      console.error('加密 WebDAV 密码失败:', e);
      password = Buffer.from(next.password, 'utf-8').toString('base64');
      encrypted = false;
    }
  }
  writeJsonSafe(webdavStorePath(), {
    url: next.url,
    username: next.username,
    password,
    encrypted,
    includeImages: next.includeImages,
    updated_at: new Date().toISOString()
  });
  return next;
}

function davParseUrl(cfg) {
  const raw = String((cfg && cfg.url) || '').trim();
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const u = new URL(raw);
    if (!u.pathname.endsWith('/')) u.pathname = `${u.pathname}/`;
    u.search = '';
    u.hash = '';
    return u;
  } catch (e) {
    return null;
  }
}

function davBaseUrl(cfg) {
  const u = davParseUrl(cfg);
  return u ? u.toString() : '';
}

// 备份目录：地址只到 WebDAV 挂载点（如坚果云 /dav/）时，统一放进 StarryFlow 子文件夹，
// 因为部分服务不允许直接在挂载点根目录创建文件（PUT 会返回 404）；地址里已经写了文件夹则直接使用
function davBackupDirectory(cfg) {
  const u = davParseUrl(cfg);
  if (!u) return { url: '', auto: false };
  const depth = u.pathname.split('/').filter(Boolean).length;
  if (depth <= 1) {
    u.pathname = `${u.pathname}StarryFlow/`;
    return { url: u.toString(), auto: true };
  }
  return { url: u.toString(), auto: false };
}

function davDirFileUrl(dirUrl, name) {
  try {
    const u = new URL(dirUrl);
    u.pathname = `${u.pathname}${encodeURIComponent(name)}`;
    return u.toString();
  } catch (e) {
    return '';
  }
}

// 从 WebDAV 的错误 XML 里提取可读原因，避免把整段 XML 丢给用户
function davServerHint(body) {
  const text = String(body || '');
  const m = text.match(/<(?:[A-Za-z0-9_-]+:)?exception>([^<]+)<\/(?:[A-Za-z0-9_-]+:)?exception>/i);
  if (m) return m[1].trim().slice(0, 120);
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function davValidate(cfg) {
  if (!davBaseUrl(cfg)) return '请填写以 http:// 或 https:// 开头的 WebDAV 地址';
  if (!cfg.username) return '请填写账号';
  if (!cfg.password) return '请填写密码（坚果云需使用应用密码）';
  return '';
}

function davSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 503/429 多为服务端临时限流，间隔逐步拉长后重试；网络抖动同样重试
// 每次请求都写进 boot.log，出现 503 时可以据此确认到底卡在哪一步
async function davRequest(cfg, target, options = {}, maxAttempts = 3) {
  const label = `${(options.method || 'GET').toUpperCase()} ${target}`;
  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBDAV_TIMEOUT);
    const started = Date.now();
    try {
      const res = await fetch(target, {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`, 'utf-8').toString('base64')}`,
          // 部分 WebDAV 服务会拒绝没有标识的客户端
          'User-Agent': `StarryFlow/${app.getVersion()} (Windows; WebDAV)`,
          ...(options.headers || {})
        }
      });
      bootLog(`[webdav] ${label} -> ${res.status} (${Date.now() - started}ms, 第 ${attempt + 1} 次)`);
      if ((res.status === 503 || res.status === 429) && attempt < maxAttempts - 1) {
        try { await res.text(); } catch (e) { /* 丢弃响应体 */ }
        await davSleep(attempt === 0 ? 1500 : 3000);
        continue;
      }
      return res;
    } catch (e) {
      lastError = e;
      bootLog(`[webdav] ${label} -> 失败 ${e && e.message ? e.message : e} (第 ${attempt + 1} 次)`);
      if (attempt < maxAttempts - 1) {
        await davSleep(attempt === 0 ? 1000 : 2000);
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('WebDAV 请求失败');
}

async function davCall(cfg, target, options, maxAttempts) {
  try {
    return { res: await davRequest(cfg, target, options, maxAttempts) };
  } catch (e) {
    return {
      error: e && e.name === 'AbortError'
        ? '连接超时，请检查地址与网络'
        : `无法连接 WebDAV：${e && e.message ? e.message : e}`
    };
  }
}

function davStatusText(status) {
  if (status === 401) return '账号或密码不正确（坚果云请使用「应用密码」）';
  if (status === 403) return '账号没有该目录的访问权限';
  if (status === 404) return '云端路径不存在（坚果云地址应为 https://dav.jianguoyun.com/dav/）';
  if (status === 405) return '服务器不支持该操作（可能未开启 WebDAV）';
  if (status === 409) return '云端目录不存在且无法自动创建';
  if (status === 429) return '请求过于频繁，云端已限流，请稍后再试';
  if (status === 503) return '云端暂时不可用（HTTP 503），已自动重试仍失败。请等 1-2 分钟再试；若持续出现，请确认坚果云服务是否正常或账号是否被临时限流';
  if (status === 507) return '云端空间不足';
  return `云端返回 HTTP ${status}`;
}

// 探测目录是否真实存在：部分服务对不存在的目录也返回 207，必须检查响应里有没有 response 节点
async function davProbeCollection(cfg, target) {
  const { res, error } = await davCall(cfg, target, {
    method: 'PROPFIND',
    headers: { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' },
    body: DAV_PROPFIND_0
  });
  if (error) return { error };
  if (!res.ok) return { status: res.status };
  const text = await res.text();
  return {
    status: res.status,
    ok: /<(?:[A-Za-z0-9_-]+:)?response\b/i.test(text)
  };
}

// 逐级 MKCOL：父级已存在才能建下一级，已存在的目录返回 405，直接忽略
// 第一段是 WebDAV 挂载点（坚果云为 /dav/），由服务商提供；不向它发 MKCOL，
// 因为部分服务对挂载点执行 MKCOL 会返回 503，导致误判为“云端不可用”
async function davCreateCollectionChain(cfg, base) {
  const u = new URL(base);
  const segments = u.pathname.split('/').filter(Boolean);
  const start = segments.length > 1 ? 1 : 0;
  let path = start === 0 ? '' : `/${segments[0]}`;
  for (let i = start; i < segments.length; i += 1) {
    path += `/${segments[i]}`;
    const target = `${u.origin}${path}/`;
    // 建目录只重试一次：重复 MKCOL 在限流时只会加重服务端负担
    let { res, error } = await davCall(cfg, target, { method: 'MKCOL' }, 2);
    if (error) return { error };
    if (res.status === 503) {
      // 目录可能本来就存在，部分服务对重复 MKCOL 回 503：先探测确认，真的不存在才重试
      const probe = await davProbeCollection(cfg, target);
      if (probe.ok) continue;
      await davSleep(1500);
      ({ res, error } = await davCall(cfg, target, { method: 'MKCOL' }, 2));
      if (error) return { error };
    }
    // 201 创建成功；405 已存在；409/403 交给调用方复查判断
    if (![200, 201, 204, 405, 409].includes(res.status) && res.status !== 403) {
      return { error: `无法创建云端文件夹（${target}）：${davStatusText(res.status)}` };
    }
  }
  return { ok: true };
}

// 目录不存在时自动创建并复查；已存在返回 created=false
async function davEnsureCollection(cfg, base) {
  const first = await davProbeCollection(cfg, base);
  if (first.error) return { error: first.error };
  if (first.ok) return { ok: true, created: false };
  // 401/403/5xx 才是真正的失败；404 或「207 但没有 response 节点」都按目录缺失处理
  if (first.status && (first.status === 401 || first.status === 403 || first.status >= 500)) {
    return { error: davStatusText(first.status) };
  }

  const created = await davCreateCollectionChain(cfg, base);
  if (created.error) return { error: created.error };

  const again = await davProbeCollection(cfg, base);
  if (again.error) return { error: again.error };
  if (again.ok) return { ok: true, created: true };
  return { error: '云端目录不存在且无法自动创建，请检查地址中的文件夹名与账号权限' };
}

function backupStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function parseDavList(xml) {
  const blocks = String(xml).match(/<(?:[A-Za-z0-9_-]+:)?response\b[\s\S]*?<\/(?:[A-Za-z0-9_-]+:)?response>/gi) || [];
  const items = [];
  const seen = new Set();
  blocks.forEach((block) => {
    const hrefMatch = block.match(/<(?:[A-Za-z0-9_-]+:)?href>([\s\S]*?)<\/(?:[A-Za-z0-9_-]+:)?href>/i);
    if (!hrefMatch) return;
    let href = hrefMatch[1].trim();
    try { href = decodeURIComponent(href); } catch (e) { /* 保留原值 */ }
    if (href.endsWith('/')) return;
    const name = href.split('/').pop();
    if (!/^StarryFlow-backup-[0-9A-Za-z._-]+\.json$/i.test(name) || seen.has(name)) return;
    seen.add(name);
    const sizeMatch = block.match(/<(?:[A-Za-z0-9_-]+:)?getcontentlength>(\d+)<\//i);
    const modMatch = block.match(/<(?:[A-Za-z0-9_-]+:)?getlastmodified>([^<]+)<\//i);
    items.push({
      name,
      size: sizeMatch ? Number(sizeMatch[1]) : 0,
      modified: modMatch ? modMatch[1] : ''
    });
  });
  return items.sort((a, b) => (a.name < b.name ? 1 : -1));
}

// ---------- 专注模块采集端 ----------
let monitorProc = null;

function bootLog(message) {
  if (!BASE_DIR) return;
  try {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(path.join(BASE_DIR, 'boot.log'), line, 'utf-8');
  } catch (e) { /* 忽略 */ }
}

function pythonCandidates() {
  return [process.env.STARRY_FLOW_PYTHON, 'F:\\PYTHON\\python.exe', 'python', 'py'].filter(Boolean);
}

function startMonitor() {
  if (monitorProc) return;

  const projectRoot = path.join(__dirname, '..');
  const devScript = path.join(projectRoot, 'monitor', 'monitor.py');
  const devExe = path.join(projectRoot, 'monitor', 'dist', 'monitor.exe');
  const bundledExe = path.join(process.resourcesPath, 'monitor', 'monitor.exe');
  const bundledScript = path.join(process.resourcesPath, 'monitor', 'monitor.py');

  const attempts = [];
  if (isDev) {
    // 开发时优先跑源码，便于热改规则；找不到 Python 再退回本地打好的 exe
    if (fs.existsSync(devScript)) {
      pythonCandidates().forEach((py) => {
        attempts.push({ cmd: py, args: ['-u', devScript], label: `Python (${py})` });
      });
    }
    if (fs.existsSync(devExe)) attempts.push({ cmd: devExe, args: [], label: '本地采集器 exe' });
  } else {
    // 打包后优先用内置 exe，不依赖客户机安装 Python
    if (fs.existsSync(bundledExe)) attempts.push({ cmd: bundledExe, args: [], label: '内置采集器' });
    if (fs.existsSync(bundledScript)) {
      pythonCandidates().forEach((py) => {
        attempts.push({ cmd: py, args: ['-u', bundledScript], label: `Python (${py})` });
      });
    }
  }

  if (!attempts.length) {
    console.error('[monitor] 没有可用的采集器：exe 缺失且未找到 Python');
    bootLog('没有可用的采集器');
    return;
  }
  bootLog(`isDev=${isDev} resources=${process.resourcesPath} attempts=${attempts.map((a) => a.label).join(' | ')}`);

  const tryAt = (index) => {
    if (index >= attempts.length) {
      console.error('[monitor] 采集器启动失败，专注模块暂不可用');
      return;
    }
    const { cmd, args, label } = attempts[index];
    const proc = spawn(cmd, args, {
      cwd: isDev ? projectRoot : process.resourcesPath,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        STARRY_FLOW_SELF_PID: String(process.pid),
        // 数据目录可能被用户改到别处，采集端必须跟随同一份路径
        STARRY_FLOW_FOCUS_DIR: DATA_DIR,
        STARRY_FLOW_SETTINGS_FILE: SETTINGS_FILE
      }
    });

    proc.stdout.on('data', (d) => console.log('[monitor]', String(d).trim()));
    proc.stderr.on('data', (d) => console.error('[monitor]', String(d).trim()));
    proc.on('error', (err) => {
      console.warn(`[monitor] ${label} 启动失败: ${err.message}`);
      bootLog(`${label} 启动失败: ${err.message}`);
      monitorProc = null;
      tryAt(index + 1);
    });
    proc.on('exit', (code) => {
      console.log('[monitor] 采集端退出，代码', code, `（${label}）`);
      bootLog(`${label} 退出，代码 ${code}`);
      if (monitorProc === proc) monitorProc = null;
    });
    monitorProc = proc;
    console.log('[monitor] 已启动', label);
    bootLog(`已启动 ${label}`);
  };

  tryAt(0);
}

function stopMonitor() {
  if (!monitorProc) return;
  try {
    monitorProc.kill();
  } catch (e) {
    console.error('[monitor] 结束采集端失败:', e);
  }
  monitorProc = null;
}

function enqueueFocusCommand(action, payload) {
  try {
    if (!fs.existsSync(COMMAND_DIR)) fs.mkdirSync(COMMAND_DIR, { recursive: true });
    const name = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    return writeJsonSafe(path.join(COMMAND_DIR, name), {
      id: name,
      action,
      payload: payload || null,
      ts: Date.now()
    });
  } catch (e) {
    console.error('写入专注指令失败:', e);
    return false;
  }
}

function dateStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

// ---------- 窗口模式与位置记忆 ----------
// 三种模式各自记住位置：classic 记尺寸与最大化，compact / mini 只记坐标
const MAIN_MIN = { width: 1100, height: 760 };
const COMPACT_MIN = { width: 360, height: 560 };
const COMPACT_DEFAULT = { width: 424, height: 704 };
const MINI_SIZE = { width: 196, height: 190 };

let appState = null;
let currentMode = 'classic';
let mainMode = 'classic';
let miniWindow = null;
let miniMoveTimer = null;
let windowStateTimer = null;
// 预览：主窗口保持显示，单独弹出迷你窗口供设置页实时查看改动
let miniPreview = false;
// 预览时的临时位置，关闭预览后还原，避免污染正式迷你模式的位置记忆
let miniPreviewPrevPos = null;

function isVisibleOnAnyDisplay(x, y, width, height) {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    const overlapX = Math.min(x + width, a.x + a.width) - Math.max(x, a.x);
    const overlapY = Math.min(y + height, a.y + a.height) - Math.max(y, a.y);
    return overlapX >= 160 && overlapY >= 100;
  });
}

function normalizePos(obj) {
  return obj && Number.isFinite(Number(obj.x)) && Number.isFinite(Number(obj.y))
    ? { x: Math.round(Number(obj.x)), y: Math.round(Number(obj.y)) }
    : null;
}

// 极简模式允许缩放，尺寸也一并记住
function normalizeRect(obj) {
  const pos = normalizePos(obj);
  if (!pos) return null;
  const width = Number(obj.width);
  const height = Number(obj.height);
  return {
    ...pos,
    ...(Number.isFinite(width) && Number.isFinite(height)
      ? { width: Math.round(width), height: Math.round(height) }
      : {})
  };
}

// 兼容旧版只存一份主窗口状态的格式
function loadAppState() {
  const saved = readJsonSafe(WINDOW_STATE_FILE) || {};
  const legacyClassic = Number.isFinite(Number(saved.width)) && Number.isFinite(Number(saved.height))
    ? {
      x: Math.round(Number(saved.x)),
      y: Math.round(Number(saved.y)),
      width: Math.round(Number(saved.width)),
      height: Math.round(Number(saved.height)),
      maximized: !!saved.maximized
    }
    : null;
  return {
    mode: ['classic', 'compact', 'mini'].includes(saved.mode) ? saved.mode : 'classic',
    mainMode: saved.mainMode === 'compact' ? 'compact' : 'classic',
    classic: saved.classic && typeof saved.classic === 'object' ? saved.classic : legacyClassic,
    compact: normalizeRect(saved.compact),
    mini: normalizePos(saved.mini)
  };
}

function persistAppState() {
  writeJsonSafe(WINDOW_STATE_FILE, appState);
}

function centered(area, width, height) {
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2)
  };
}

function classicBounds() {
  const saved = appState.classic || {};
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.max(MAIN_MIN.width, Math.round(Number(saved.width) || 1360));
  const height = Math.max(MAIN_MIN.height, Math.round(Number(saved.height) || 900));
  if (Number.isFinite(Number(saved.x)) && Number.isFinite(Number(saved.y))) {
    const x = Math.round(Number(saved.x));
    const y = Math.round(Number(saved.y));
    if (isVisibleOnAnyDisplay(x, y, width, height)) return { x, y, width, height };
  }
  return { ...centered(area, width, height), width, height };
}

function compactBounds() {
  const area = screen.getPrimaryDisplay().workArea;
  const saved = appState.compact || {};
  const width = Math.min(
    Math.max(COMPACT_MIN.width, Math.round(Number(saved.width) || COMPACT_DEFAULT.width)),
    Math.max(COMPACT_MIN.width, area.width - 16)
  );
  const height = Math.min(
    Math.max(COMPACT_MIN.height, Math.round(Number(saved.height) || COMPACT_DEFAULT.height)),
    Math.max(COMPACT_MIN.height, area.height - 24)
  );
  const pos = normalizePos(saved);
  if (pos && isVisibleOnAnyDisplay(pos.x, pos.y, width, height)) {
    return { x: pos.x, y: pos.y, width, height };
  }
  return { ...centered(area, width, height), width, height };
}

function miniSizeFromSettings() {
  const saved = readJsonSafe(SETTINGS_FILE) || {};
  const cfg = saved.mini && typeof saved.mini === 'object' ? saved.mini : {};
  const clamp = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
  };
  return {
    width: clamp(cfg.width, 140, 420, MINI_SIZE.width),
    height: clamp(cfg.height, 140, 400, MINI_SIZE.height)
  };
}

function miniBounds(size = MINI_SIZE) {
  const area = screen.getPrimaryDisplay().workArea;
  const saved = appState.mini;
  if (saved && isVisibleOnAnyDisplay(saved.x, saved.y, size.width, size.height)) {
    return { x: saved.x, y: saved.y, ...size };
  }
  // 默认贴在屏幕最上方居中
  return {
    x: Math.round(area.x + (area.width - size.width) / 2),
    y: area.y + 16,
    ...size
  };
}

// 预览窗口要完整落在屏幕里，也不能压住设置页：
// 依次尝试主窗口右侧、主窗口下方、屏幕右上角，都放不下就用最后一个（贴边）
function placeMiniForPreview() {
  if (!miniWindow || miniWindow.isDestroyed()) return;
  const b = miniWindow.getBounds();
  const fullyVisible = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x >= a.x && b.y >= a.y
      && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height;
  });
  const mb = mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null;
  const intersects = mb ? !(
    b.x + b.width <= mb.x || b.x >= mb.x + mb.width
    || b.y + b.height <= mb.y || b.y >= mb.y + mb.height
  ) : false;
  if (fullyVisible && !intersects) return;

  const area = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea;
  const clampY = (y) => Math.max(area.y + 8, Math.min(y, area.y + area.height - b.height - 8));
  const candidates = [];
  if (mb) {
    candidates.push({ x: mb.x + mb.width + 16, y: clampY(mb.y + 16) });
    candidates.push({ x: mb.x + 16, y: clampY(mb.y + mb.height + 16) });
  }
  candidates.push({ x: area.x + area.width - b.width - 24, y: area.y + 24 });
  const target = candidates.find(
    (p) => p.x >= area.x + 8 && p.x + b.width <= area.x + area.width - 8
  ) || candidates[candidates.length - 1];
  miniWindow.setBounds({
    x: Math.round(target.x),
    y: Math.round(target.y),
    width: b.width,
    height: b.height
  });
}

// 尺寸变化后把窗口收进所在屏幕的工作区，避免面板被挤出屏幕
function boundsWithinDisplay(bounds) {
  const area = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea;
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
    width,
    height
  };
}

function saveMainState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.isMaximized() ? mainWindow.getNormalBounds() : mainWindow.getBounds();
  if (mainMode === 'compact') {
    appState.compact = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    };
  } else {
    appState.classic = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: mainWindow.isMaximized()
    };
  }
  persistAppState();
}

function scheduleSaveMainState() {
  clearTimeout(windowStateTimer);
  windowStateTimer = setTimeout(saveMainState, 600);
}

function applyMainMode(mode) {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  mainMode = mode;
  appState.mainMode = mode;
  if (mode === 'compact') {
    win.setMinimumSize(COMPACT_MIN.width, COMPACT_MIN.height);
    if (win.isMaximized()) win.unmaximize();
    win.setBounds(compactBounds());
    // 极简模式允许用户自行缩放，尺寸会随窗口状态一起记住
    win.setResizable(true);
    win.setAlwaysOnTop(false);
  } else {
    win.setResizable(true);
    win.setMinimumSize(MAIN_MIN.width, MAIN_MIN.height);
    if (win.isMaximized()) win.unmaximize();
    win.setBounds(classicBounds());
    if (appState.classic && appState.classic.maximized) win.maximize();
    win.setAlwaysOnTop(false);
  }
  if (!win.isDestroyed()) win.webContents.send('window:mode', mode);
}

function createMiniWindow() {
  const size = miniSizeFromSettings();
  const win = new BrowserWindow({
    ...miniBounds(size),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    // 系统圆角会与自绘圆角叠加出黑角，透明窗口必须关掉
    roundedCorners: false,
    alwaysOnTop: true,
    show: false,
    title: 'Starry Flow 星流',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  miniWindow = win;
  win.setAlwaysOnTop(true, 'floating');
  // 原生拖动没有结束事件，用 move 防抖记住位置；预览中的临时挪动不写入记忆
  win.on('move', () => {
    clearTimeout(miniMoveTimer);
    miniMoveTimer = setTimeout(() => {
      if (!miniWindow || miniWindow.isDestroyed() || miniPreview) return;
      const [x, y] = miniWindow.getPosition();
      appState.mini = { x, y };
      persistAppState();
    }, 400);
  });
  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return;
    win.webContents.send('mini:preview', miniPreview);
    if (currentMode === 'mini' || miniPreview) {
      // 预览时主窗口还开着，先把面板挪到主窗口之外并抬到最前，避免被主窗口盖住
      if (miniPreview) placeMiniForPreview();
      win.showInactive();
      if (miniPreview) win.moveTop();
    }
  });
  win.on('closed', () => {
    miniWindow = null;
    bootLog('迷你窗口已关闭');
    // 主窗口此时是隐藏的，重新显示为极简，避免应用没有任何可见窗口
    if (currentMode === 'mini' && mainWindow && !mainWindow.isDestroyed()) {
      currentMode = 'compact';
      appState.mode = 'compact';
      applyMainMode('compact');
      mainWindow.show();
      mainWindow.focus();
      persistAppState();
    }
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    bootLog(`迷你窗口渲染进程退出 reason=${details.reason} exitCode=${details.exitCode}`);
  });
  if (isDev) {
    win.loadURL('http://localhost:5173/?mode=mini');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { search: 'mode=mini' });
  }
}

function showMiniWindow() {
  if (!miniWindow || miniWindow.isDestroyed()) {
    createMiniWindow();
    return;
  }
  miniWindow.showInactive();
}

// 设置页的预览开关：只弹出迷你窗口，不改变主窗口当前的显示模式
function setMiniPreview(on) {
  const next = on === true;
  if (next === miniPreview) return { ok: true, preview: miniPreview };
  miniPreview = next;
  if (next) {
    // 先记下正式迷你模式的位置，预览结束再还回去
    const [x, y] = miniWindow && !miniWindow.isDestroyed()
      ? miniWindow.getPosition()
      : [appState.mini ? appState.mini.x : null, appState.mini ? appState.mini.y : null];
    miniPreviewPrevPos = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    if (!miniWindow || miniWindow.isDestroyed()) {
      createMiniWindow(); // ready-to-show 会按 miniPreview 决定是否显示
    } else {
      miniWindow.webContents.send('mini:preview', true);
      placeMiniForPreview();
      miniWindow.showInactive();
      miniWindow.moveTop();
    }
  } else if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.webContents.send('mini:preview', false);
    miniWindow.hide();
    if (miniPreviewPrevPos) {
      const b = miniWindow.getBounds();
      miniWindow.setBounds({ ...miniPreviewPrevPos, width: b.width, height: b.height });
    }
    miniPreviewPrevPos = null;
  }
  return { ok: true, preview: miniPreview };
}

function setWindowMode(mode) {
  if (!appState) return currentMode;
  if (!['classic', 'compact', 'mini'].includes(mode) || mode === currentMode) return currentMode;

  if (mode === 'mini') {
    // 正式进入迷你模式时，预览状态作废，避免两套逻辑互相干扰
    miniPreview = false;
    saveMainState();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    showMiniWindow();
  } else if (currentMode === 'mini') {
    if (miniWindow && !miniWindow.isDestroyed()) miniWindow.hide();
    applyMainMode(mode);
    // 等渲染层按新模式重排完再显示，避免闪一帧旧布局
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
    }, 120);
  } else {
    saveMainState();
    applyMainMode(mode);
  }

  currentMode = mode;
  appState.mode = mode;
  persistAppState();
  return currentMode;
}

function createWindow(mode) {
  const compact = mode === 'compact';
  const bounds = compact ? compactBounds() : classicBounds();
  const win = new BrowserWindow({
    ...bounds,
    minWidth: compact ? COMPACT_MIN.width : MAIN_MIN.width,
    minHeight: compact ? COMPACT_MIN.height : MAIN_MIN.height,
    resizable: true,
    show: false,
    backgroundColor: '#060e24',
    title: 'Starry Flow 星流',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    frame: false,              // 自绘沉浸式标题栏，标题栏按钮由渲染层绘制
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow = win;
  mainMode = compact ? 'compact' : 'classic';
  appState.mainMode = mainMode;
  if (!compact && appState.classic && appState.classic.maximized) win.maximize();

  // 渲染层异常时 ready-to-show 可能永远不来，兜底 3 秒后照样把窗口显示出来
  const showFallback = setTimeout(() => {
    if (!win.isDestroyed() && currentMode !== 'mini' && !win.isVisible()) {
      bootLog('ready-to-show 超时，兜底显示窗口');
      win.show();
    }
  }, 3000);
  win.once('ready-to-show', () => {
    clearTimeout(showFallback);
    if (win.isDestroyed()) return;
    if (currentMode === 'mini') win.hide();
    else win.show();
  });

  // 拖动/缩放结束后延迟落盘，避免高频写文件
  win.on('resize', scheduleSaveMainState);
  win.on('move', scheduleSaveMainState);
  // 自绘按钮需要知道当前是否已最大化，用于切换「最大化 / 还原」图标
  const notifyMaximized = () => {
    if (!win.isDestroyed()) win.webContents.send('window:maximized', win.isMaximized());
  };
  win.on('maximize', notifyMaximized);
  win.on('unmaximize', notifyMaximized);
  win.on('close', () => {
    clearTimeout(windowStateTimer);
    saveMainState();
  });

  if (isDev) {
    console.log('[main] 载入开发服务器 http://localhost:5173');
    win.loadURL('http://localhost:5173');
  } else {
    console.log('[main] 载入打包页面 dist/index.html');
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    bootLog(`页面加载失败 ${code} ${desc} ${url}`);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    bootLog(`渲染进程退出 reason=${details.reason} exitCode=${details.exitCode}`);
  });
  win.on('closed', () => {
    mainWindow = null;
    bootLog('窗口已关闭');
  });
  win.on('unresponsive', () => bootLog('窗口无响应'));
}

function bootstrap() {
  initPaths();
  ensureDataDir();

  ipcMain.handle('settings:get', () => {
    return readJsonSafe(SETTINGS_FILE);
  });

  // 自绘标题栏：最小化 / 最大化还原 / 关闭
  ipcMain.on('window:control', (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    } else if (action === 'close') win.close();
  });

  ipcMain.handle('window:is-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? win.isMaximized() : false;
  });

  // 三种显示模式的切换与查询
  ipcMain.handle('window:get-mode', () => currentMode);
  ipcMain.handle('window:set-mode', (_event, mode) => setWindowMode(mode));

  // 版本号直接取打包/开发时 package.json 的 version，升版后界面自动同步
  ipcMain.handle('app:version', () => app.getVersion());

  // 迷你窗口：点击按钮切回极简；位置由原生拖动后随 move 事件记忆
  ipcMain.on('mini:activate', () => {
    if (miniPreview) return; // 预览窗口里的按钮不触发模式切换
    setWindowMode('compact');
  });
  // 设置页的预览开关：显示 / 隐藏迷你窗口，主窗口保持原样
  ipcMain.handle('mini:preview', (_event, on) => setMiniPreview(on));
  ipcMain.handle('mini:preview-state', () => miniPreview);
  // 面板尺寸由外观设置控制，窗口随之伸缩并收进当前屏幕工作区
  ipcMain.handle('mini:set-size', (_event, size) => {
    if (!miniWindow || miniWindow.isDestroyed()) return { ok: false };
    const clamp = (v, min, max, fallback) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
    };
    const width = clamp(size && size.width, 140, 420, MINI_SIZE.width);
    const height = clamp(size && size.height, 140, 400, MINI_SIZE.height);
    const [x, y] = miniWindow.getPosition();
    miniWindow.setBounds(boundsWithinDisplay({ x, y, width, height }));
    return { ok: true, width, height };
  });

  ipcMain.handle('settings:set', (_event, settings) => {
    const ok = writeJsonSafe(SETTINGS_FILE, settings);
    // 迷你窗口开着（含预览）时立刻同步尺寸，并通知渲染层重读设置，滑块拖动即可见
    const mini = settings && settings.mini;
    if (miniWindow && !miniWindow.isDestroyed()) {
      const w = Math.max(140, Math.min(420, Math.round(Number(mini && mini.width) || MINI_SIZE.width)));
      const h = Math.max(140, Math.min(400, Math.round(Number(mini && mini.height) || MINI_SIZE.height)));
      const b = miniWindow.getBounds();
      if (b.width !== w || b.height !== h) {
        miniWindow.setBounds(boundsWithinDisplay({ x: b.x, y: b.y, width: w, height: h }));
      }
      miniWindow.webContents.send('settings:changed');
    }
    return ok;
  });

  ipcMain.handle('monitor:read', () => {
    return readJsonSafe(MONITOR_FILE);
  });

  ipcMain.handle('monitor:path', () => MONITOR_FILE);

  ipcMain.handle('marks:get', () => readJsonSafe(MARKS_FILE) || {});

  ipcMain.handle('marks:set', (_event, marks) => {
    return writeJsonSafe(MARKS_FILE, marks || {});
  });

  // 成就存档：前端负责判定，主进程只做落盘
  ipcMain.handle('achievements:get', () => readJsonSafe(ACHIEVEMENTS_FILE) || {});

  ipcMain.handle('achievements:set', (_event, data) => {
    return writeJsonSafe(ACHIEVEMENTS_FILE, data || {});
  });

  // 图片单独落盘，月份文件里只存文件名，避免 JSON 膨胀
  ipcMain.handle('marks:saveImage', (_event, payload) => {
    try {
      const { dateKey, dataUrl, oldFile } = payload || {};
      const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(dataUrl || '');
      if (!m) return { ok: false, error: '图片格式不支持' };

      ensureMarksDir();
      const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
      const safeDate = String(dateKey || 'unknown').replace(/[^\d-]/g, '');
      const file = `${safeDate}-${Date.now()}.${ext}`;
      fs.writeFileSync(markFilePath(file), Buffer.from(m[2], 'base64'));

      if (oldFile && oldFile !== file) removeMarkImage(oldFile);
      return { ok: true, file };
    } catch (e) {
      console.error('保存印痕图片失败:', e);
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('marks:readImage', (_event, fileName) => {
    try {
      const p = markFilePath(fileName);
      if (!fs.existsSync(p)) return null;
      const ext = path.extname(p).slice(1).toLowerCase();
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
      return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
    } catch (e) {
      console.error('读取印痕图片失败:', e);
      return null;
    }
  });

  ipcMain.handle('marks:deleteImage', (_event, fileName) => {
    removeMarkImage(fileName);
    return true;
  });

  // 印痕大图另存为：已落盘的直接复制原文件，未落盘的按 dataURL 写出
  ipcMain.handle('marks:saveAs', async (_event, payload) => {
    try {
      const { file, dataUrl } = payload || {};
      const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(dataUrl || '');
      const extFile = file ? path.extname(file).slice(1).toLowerCase() : '';
      const ext = m ? (m[1] === 'jpeg' ? 'jpg' : m[1]) : (extFile || 'jpg');
      const res = await dialog.showSaveDialog({
        title: '另存图片',
        defaultPath: `印痕-${dateStamp()}.${ext}`,
        filters: [{ name: '图片', extensions: [ext] }]
      });
      if (res.canceled || !res.filePath) return { ok: false, canceled: true };
      if (file && fs.existsSync(markFilePath(file))) {
        fs.copyFileSync(markFilePath(file), res.filePath);
      } else if (m) {
        fs.writeFileSync(res.filePath, Buffer.from(m[2], 'base64'));
      } else {
        return { ok: false, error: '没有可保存的图片' };
      }
      return { ok: true, path: res.filePath };
    } catch (e) {
      console.error('另存图片失败:', e);
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('focus:read', () => readJsonSafe(FOCUS_FILE));

  ipcMain.handle('focus:path', () => FOCUS_FILE);

  ipcMain.handle('focus:command', (_event, command) => {
    if (!command || !command.action) return false;
    return enqueueFocusCommand(command.action, command.payload);
  });

  // 进程图标：按 exe 路径缓存，避免每次打开选择窗口重复读取
  const iconCache = new Map();
  ipcMain.handle('process:icon', async (_event, exePath) => {
    if (!exePath || typeof exePath !== 'string') return null;
    if (iconCache.has(exePath)) return iconCache.get(exePath);
    try {
      const img = await app.getFileIcon(exePath, { size: 'normal' });
      const url = img.toDataURL();
      iconCache.set(exePath, url);
      return url;
    } catch (e) {
      iconCache.set(exePath, null);
      return null;
    }
  });

  // ---------- 数据存储位置 ----------
  // Windows 路径大小写不敏感，比较前统一小写，避免用户只是大小写不同就触发重启提示
  const samePath = (a, b) => path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase();

  const copyFileIfMissing = (src, dest) => {
    if (!fs.existsSync(src) || fs.existsSync(dest)) return false;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    return true;
  };

  // 逐个文件复制，不覆盖目标目录里已有的同名文件
  const copyDirInto = (srcDir, destDir) => {
    if (!fs.existsSync(srcDir)) return false;
    fs.mkdirSync(destDir, { recursive: true });
    fs.readdirSync(srcDir).forEach((name) => {
      const src = path.join(srcDir, name);
      const dest = path.join(destDir, name);
      if (fs.existsSync(dest)) return;
      if (fs.statSync(src).isDirectory()) fs.cpSync(src, dest, { recursive: true });
      else fs.copyFileSync(src, dest);
    });
    return true;
  };

  const storageInfo = () => {
    const opts = readStorageOptions();
    const target = resolveStorage(opts);
    const restartRequired =
      !samePath(target.focusDir, DATA_DIR) ||
      !samePath(target.marksFile, MARKS_FILE) ||
      !samePath(target.marksImageDir, MARKS_DIR);
    return {
      baseDir: BASE_DIR,
      focusFile: target.focusFile,
      marksFile: target.marksFile,
      marksImageDir: target.marksImageDir,
      defaults: {
        focusFile: path.join(BASE_DIR, 'focus-data.json'),
        marksFile: path.join(BASE_DIR, 'marks.json'),
        marksImageDir: path.join(BASE_DIR, 'marks')
      },
      isCustom: {
        focus: Boolean(opts.focusDir),
        marksText: Boolean(opts.marksFileDir),
        marksImage: Boolean(opts.marksImageDir)
      },
      restartRequired
    };
  };

  ipcMain.handle('storage:get', () => storageInfo());

  // 打开界面上展示的路径：文件在资源管理器里定位，文件夹直接打开
  ipcMain.handle('storage:open', async (_event, kind) => {
    try {
      const target = resolveStorage(readStorageOptions());
      const item = {
        focus: target.focusFile,
        marksText: target.marksFile,
        marksImage: target.marksImageDir
      }[kind];
      if (!item) return { ok: false, error: '未知的数据类型' };

      if (kind === 'marksImage') {
        // 目录可能刚改过还没重启，先确保存在再打开
        fs.mkdirSync(item, { recursive: true });
        const err = await shell.openPath(item);
        return err ? { ok: false, error: err } : { ok: true };
      }
      if (fs.existsSync(item)) {
        shell.showItemInFolder(item);
        return { ok: true };
      }
      const dir = path.dirname(item);
      fs.mkdirSync(dir, { recursive: true });
      const err = await shell.openPath(dir);
      return err ? { ok: false, error: err } : { ok: true };
    } catch (e) {
      console.error('打开数据路径失败:', e);
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('storage:choose', async (_event, kind) => {
    const titles = {
      focus: '选择积分与额度的存放文件夹',
      marksText: '选择印痕文字的存放文件夹',
      marksImage: '选择印痕图片的存放文件夹'
    };
    if (!titles[kind]) return { ok: false, error: '未知的数据类型' };
    const res = await dialog.showOpenDialog({
      title: titles[kind],
      properties: ['openDirectory', 'createDirectory']
    });
    if (res.canceled || !res.filePaths || !res.filePaths.length) {
      return { ok: false, canceled: true };
    }
    const dir = res.filePaths[0];
    try {
      const opts = readStorageOptions();
      if (kind === 'focus') {
        // 换目录时把现有数据带过去，避免用户切换到新位置后看到空白数据
        if (!samePath(dir, DATA_DIR)) {
          copyFileIfMissing(FOCUS_FILE, path.join(dir, 'focus-data.json'));
          copyFileIfMissing(MONITOR_FILE, path.join(dir, 'monitor-data.json'));
          copyDirInto(COMMAND_DIR, path.join(dir, 'focus-commands'));
        }
        opts.focusDir = dir;
      } else if (kind === 'marksText') {
        if (!samePath(dir, path.dirname(MARKS_FILE))) {
          copyFileIfMissing(MARKS_FILE, path.join(dir, 'marks.json'));
        }
        opts.marksFileDir = dir;
      } else {
        if (!samePath(dir, MARKS_DIR)) copyDirInto(MARKS_DIR, dir);
        opts.marksImageDir = dir;
      }
      if (!writeJsonSafe(STORAGE_FILE, opts)) return { ok: false, error: '写入路径配置失败' };
      return { ok: true, info: storageInfo() };
    } catch (e) {
      console.error('更改数据位置失败:', e);
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('storage:reset', (_event, kind) => {
    try {
      const opts = readStorageOptions();
      if (kind === 'focus') {
        if (!samePath(DATA_DIR, BASE_DIR)) {
          copyFileIfMissing(FOCUS_FILE, path.join(BASE_DIR, 'focus-data.json'));
          copyFileIfMissing(MONITOR_FILE, path.join(BASE_DIR, 'monitor-data.json'));
          copyDirInto(COMMAND_DIR, path.join(BASE_DIR, 'focus-commands'));
        }
        opts.focusDir = '';
      } else if (kind === 'marksText') {
        const defFile = path.join(BASE_DIR, 'marks.json');
        if (!samePath(MARKS_FILE, defFile)) copyFileIfMissing(MARKS_FILE, defFile);
        opts.marksFileDir = '';
      } else if (kind === 'marksImage') {
        const defDir = path.join(BASE_DIR, 'marks');
        if (!samePath(MARKS_DIR, defDir)) copyDirInto(MARKS_DIR, defDir);
        opts.marksImageDir = '';
      } else {
        return { ok: false, error: '未知的数据类型' };
      }
      if (!writeJsonSafe(STORAGE_FILE, opts)) return { ok: false, error: '写入路径配置失败' };
      return { ok: true, info: storageInfo() };
    } catch (e) {
      console.error('恢复默认数据位置失败:', e);
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.on('app:restart', () => {
    stopMonitor();
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle('backup:export', async () => {
    const res = await dialog.showSaveDialog({
      title: '导出备份',
      defaultPath: `StarryFlow-backup-${dateStamp()}.json`,
      filters: [{ name: 'JSON 备份文件', extensions: ['json'] }]
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    try {
      const payload = buildBackupPayload();
      fs.writeFileSync(res.filePath, JSON.stringify(payload, null, 2), 'utf-8');
      return {
        ok: true,
        path: res.filePath,
        summary: {
          images: Object.keys(payload.marksImages || {}).length,
          cumulative: payload.focus ? payload.focus.cumulative_points : 0
        }
      };
    } catch (e) {
      console.error('导出备份失败:', e);
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('backup:import', async () => {
    const res = await dialog.showOpenDialog({
      title: '导入备份',
      properties: ['openFile'],
      filters: [{ name: 'JSON 备份文件', extensions: ['json'] }]
    });
    if (res.canceled || !res.filePaths || !res.filePaths.length) {
      return { ok: false, canceled: true };
    }
    try {
      const raw = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf-8'));
      return applyBackupPayload(raw);
    } catch (e) {
      console.error('导入备份失败:', e);
      return { ok: false, error: String(e) };
    }
  });

  // ---------- WebDAV 云备份：测试 / 上传 / 列表 / 恢复 ----------
  ipcMain.handle('webdav:get', () => {
    const cfg = readWebdavConfig();
    return {
      url: cfg.url,
      username: cfg.username,
      hasPassword: Boolean(cfg.password),
      includeImages: cfg.includeImages !== false
    };
  });

  // 只改备份选项（印痕图片是否上传），不触碰账号密码
  ipcMain.handle('webdav:option', (_event, patch) => {
    const cfg = saveWebdavConfig(patch);
    return { ok: true, includeImages: cfg.includeImages !== false };
  });

  ipcMain.handle('webdav:test', async (_event, patch) => {
    const cfg = saveWebdavConfig(patch);
    const invalid = davValidate(cfg);
    if (invalid) return { ok: false, error: invalid };
    // 测试只做探测，不建目录：避免在用户只是验证连接时反复触发 MKCOL 与限流
    const dir = davBackupDirectory(cfg);
    const probe = await davProbeCollection(cfg, dir.url);
    if (probe.error) return { ok: false, error: probe.error };
    if (!probe.ok) {
      if (probe.status && probe.status !== 404 && probe.status !== 207) {
        return { ok: false, error: davStatusText(probe.status) };
      }
      return {
        ok: true,
        folderMissing: true,
        message: dir.auto
          ? '连接成功，备份将保存在 StarryFlow 子文件夹（上传时自动创建）'
          : '连接成功，但目标文件夹尚不存在（上传时会自动创建）'
      };
    }
    return {
      ok: true,
      message: `连接成功（HTTP ${probe.status}）${dir.auto ? '，备份保存在 StarryFlow 子文件夹' : ''}`
    };
  });

  ipcMain.handle('webdav:upload', async (_event, patch) => {
    const cfg = saveWebdavConfig(patch);
    const invalid = davValidate(cfg);
    if (invalid) return { ok: false, error: invalid };

    const dir = davBackupDirectory(cfg);
    // 按云备份设置决定是否带上印痕图片，关闭时只传文字与数据
    const payload = buildBackupPayload(cfg.includeImages !== false);
    const body = JSON.stringify(payload, null, 2);
    const name = `StarryFlow-backup-${backupStamp()}.json`;
    const target = davDirFileUrl(dir.url, name);
    const put = () => davCall(cfg, target, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body
    });

    // 直接写入：目录通常已经存在，一次 PUT 就够。
    // 先探测再写入会多一个 PROPFIND，云端限流时更容易被误判成“不可用”
    let { res, error } = await put();
    if (error) return { ok: false, error };

    if (res.status === 404 || res.status === 409) {
      // 目录不存在或不完整：补建后再写一次
      const ensured = await davEnsureCollection(cfg, dir.url);
      if (ensured.error) return { ok: false, error: ensured.error };
      await new Promise((r) => setTimeout(r, 800));
      ({ res, error } = await put());
      if (error) return { ok: false, error };
    } else if (res.status === 503) {
      // 只有当探测明确显示目录不存在（404）时才补建；
      // 目录存在却 503 说明云端本身不可用，再发建目录请求只会加重限流
      const probe = await davProbeCollection(cfg, dir.url);
      if (!probe.error && probe.status === 404) {
        const ensured = await davEnsureCollection(cfg, dir.url);
        if (!ensured.error) {
          await new Promise((r) => setTimeout(r, 1000));
          ({ res, error } = await put());
          if (error) return { ok: false, error };
        }
      }
    }
    if (!res.ok) {
      let detail = '';
      try { detail = davServerHint(await res.text()); } catch (e) { /* 忽略 */ }
      return {
        ok: false,
        error: `${davStatusText(res.status)} · 请求地址 ${target}${detail ? ` · 服务端返回 ${detail}` : ''}`
      };
    }
    return {
      ok: true,
      name,
      message: `已上传云端备份：${name}（${(Buffer.byteLength(body) / 1024 / 1024).toFixed(2)} MB）`
    };
  });

  ipcMain.handle('webdav:list', async (_event, patch) => {
    const cfg = patch ? saveWebdavConfig(patch) : readWebdavConfig();
    const invalid = davValidate(cfg);
    if (invalid) return { ok: false, error: invalid };
    const dir = davBackupDirectory(cfg);
    const { res, error } = await davCall(cfg, dir.url, {
      method: 'PROPFIND',
      headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
      body: DAV_PROPFIND_1
    });
    if (error) return { ok: false, error };
    // 目录还没建过时视为“暂无备份”，不当作错误
    if (res.status === 404) return { ok: true, items: [], missing: true };
    if (!res.ok) return { ok: false, error: davStatusText(res.status) };
    return { ok: true, items: parseDavList(await res.text()), folder: dir.auto ? 'StarryFlow' : '' };
  });

  ipcMain.handle('webdav:restore', async (_event, name) => {
    const safeName = String(name || '');
    if (!/^StarryFlow-backup-[0-9A-Za-z._-]+\.json$/.test(safeName)) {
      return { ok: false, error: '备份文件名无效' };
    }
    const cfg = readWebdavConfig();
    const invalid = davValidate(cfg);
    if (invalid) return { ok: false, error: invalid };
    const { res, error } = await davCall(cfg, davDirFileUrl(davBackupDirectory(cfg).url, safeName), {
      method: 'GET'
    });
    if (error) return { ok: false, error };
    if (!res.ok) return { ok: false, error: davStatusText(res.status) };
    let raw;
    try {
      raw = JSON.parse(await res.text());
    } catch (e) {
      return { ok: false, error: '云端文件不是有效的备份 JSON' };
    }
    const result = applyBackupPayload(raw);
    if (result.ok) result.name = safeName;
    return result;
  });

  // 恢复上次的模式：经典 / 极简直接打开主窗口，迷你则隐藏主窗口只显示迷你窗
  appState = loadAppState();
  currentMode = appState.mode;
  createWindow(appState.mainMode);
  if (currentMode === 'mini') {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    createMiniWindow();
  }
  startMonitor();
  bootLog(`whenReady 完成 isDev=${isDev} mode=${currentMode}`);

  process.on('uncaughtException', (err) => {
    bootLog(`未捕获异常: ${err && err.stack ? err.stack.split('\n')[0] : err}`);
  });

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow(appState.mainMode);
  });
}

app.on('window-all-closed', () => {
  bootLog('window-all-closed 触发');
  stopMonitor();
  if (process.platform !== 'darwin') app.quit();
});

app.on('child-process-gone', (_e, details) => {
  bootLog(`子进程退出 type=${details.type} reason=${details.reason} exitCode=${details.exitCode}`);
});

app.on('before-quit', () => {
  bootLog('before-quit 触发');
  stopMonitor();
});

// ---------- 启动 ----------
// 上一次退出时，Electron 主进程、GPU 子进程与 Python 采集端需要一点时间才会真正结束，
// 这期间 requestSingleInstanceLock() 会失败。老逻辑直接 quit，就表现为“双击没反应、任务管理器里有进程”。
// 这里在锁被占用时短暂重试，旧进程退净后由本次启动接管。
const initialLock = app.requestSingleInstanceLock();
if (initialLock) {
  bindSingleInstance();
  app.whenReady().then(bootstrap);
} else {
  const deadline = Date.now() + 6000;
  const retry = setInterval(() => {
    if (app.requestSingleInstanceLock()) {
      clearInterval(retry);
      bindSingleInstance();
      app.whenReady().then(bootstrap);
      return;
    }
    if (Date.now() >= deadline) {
      clearInterval(retry);
      app.quit();
    }
  }, 250);
}
