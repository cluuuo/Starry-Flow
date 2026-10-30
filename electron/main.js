const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

// 开发模式：npm run dev 会带 --dev；打包后必然不成立
const isDev = process.argv.includes('--dev') || !app.isPackaged;

// 单实例锁：星空动画持续占用 GPU，重复启动会让占用成倍叠加，必须拦住
const gotSingleInstanceLock = app.requestSingleInstanceLock();
let mainWindow = null;
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
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

let DATA_DIR;
let SETTINGS_FILE;
let MONITOR_FILE;
let FOCUS_FILE;
let COMMAND_DIR;
let MARKS_FILE;
let MARKS_DIR;
let WINDOW_STATE_FILE;

function initPaths() {
  DATA_DIR = path.join(getLocalAppData(), 'StarryFlow');
  SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
  MONITOR_FILE = path.join(DATA_DIR, 'monitor-data.json');
  FOCUS_FILE = path.join(DATA_DIR, 'focus-data.json');
  COMMAND_DIR = path.join(DATA_DIR, 'focus-commands');
  MARKS_FILE = path.join(DATA_DIR, 'marks.json');
  MARKS_DIR = path.join(DATA_DIR, 'marks');
  WINDOW_STATE_FILE = path.join(DATA_DIR, 'window-state.json');
  console.log('[main] DATA_DIR =', DATA_DIR);
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  console.log('[main] DATA_DIR exists =', fs.existsSync(DATA_DIR));
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
    ensureDataDir();
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

// ---------- 专注模块采集端 ----------
let monitorProc = null;

function bootLog(message) {
  try {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(path.join(DATA_DIR, 'boot.log'), line, 'utf-8');
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
      env: { ...process.env, STARRY_FLOW_SELF_PID: String(process.pid) }
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

// ---------- 窗口位置记忆 ----------
function loadWindowState() {
  const fallback = { width: 1360, height: 900 };
  const saved = readJsonSafe(WINDOW_STATE_FILE);
  const size = saved && Number.isFinite(Number(saved.width)) && Number.isFinite(Number(saved.height))
    ? {
      width: Math.max(1100, Math.round(Number(saved.width))),
      height: Math.max(760, Math.round(Number(saved.height)))
    }
    : fallback;

  // 换显示器或拔掉副屏后，旧坐标可能落在屏幕外，此时回到主屏居中
  if (saved && Number.isFinite(Number(saved.x)) && Number.isFinite(Number(saved.y))) {
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      const overlapX = Math.min(saved.x + size.width, a.x + a.width) - Math.max(saved.x, a.x);
      const overlapY = Math.min(saved.y + size.height, a.y + a.height) - Math.max(saved.y, a.y);
      return overlapX >= 160 && overlapY >= 100;
    });
    if (visible) {
      return {
        ...size,
        x: Math.round(Number(saved.x)),
        y: Math.round(Number(saved.y)),
        maximized: !!saved.maximized
      };
    }
  }

  const area = screen.getPrimaryDisplay().workArea;
  return {
    ...size,
    x: Math.round(area.x + (area.width - size.width) / 2),
    y: Math.round(area.y + (area.height - size.height) / 2),
    maximized: false
  };
}

let windowStateTimer = null;

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
  writeJsonSafe(WINDOW_STATE_FILE, {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    maximized: win.isMaximized()
  });
}

function createWindow() {
  const state = loadWindowState();
  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 1100,
    minHeight: 760,
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
  if (state.maximized) win.maximize();

  // 拖动/缩放结束后延迟落盘，避免高频写文件
  const rememberState = () => {
    clearTimeout(windowStateTimer);
    windowStateTimer = setTimeout(() => saveWindowState(win), 600);
  };
  win.on('resize', rememberState);
  win.on('move', rememberState);
  // 自绘按钮需要知道当前是否已最大化，用于切换「最大化 / 还原」图标
  const notifyMaximized = () => {
    if (!win.isDestroyed()) win.webContents.send('window:maximized', win.isMaximized());
  };
  win.on('maximize', notifyMaximized);
  win.on('unmaximize', notifyMaximized);
  win.on('close', () => {
    clearTimeout(windowStateTimer);
    saveWindowState(win);
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

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
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

  ipcMain.handle('settings:set', (_event, settings) => {
    return writeJsonSafe(SETTINGS_FILE, settings);
  });

  ipcMain.handle('monitor:read', () => {
    return readJsonSafe(MONITOR_FILE);
  });

  ipcMain.handle('monitor:path', () => MONITOR_FILE);

  ipcMain.handle('marks:get', () => readJsonSafe(MARKS_FILE) || {});

  ipcMain.handle('marks:set', (_event, marks) => {
    return writeJsonSafe(MARKS_FILE, marks || {});
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

  ipcMain.handle('backup:export', async () => {
    const res = await dialog.showSaveDialog({
      title: '导出备份',
      defaultPath: `StarryFlow-backup-${dateStamp()}.json`,
      filters: [{ name: 'JSON 备份文件', extensions: ['json'] }]
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    try {
      const payload = {
        app: 'Starry Flow',
        version: '0.1.0',
        exported_at: new Date().toISOString(),
        focus: readJsonSafe(FOCUS_FILE),
        settings: readJsonSafe(SETTINGS_FILE),
        marks: readJsonSafe(MARKS_FILE)
      };
      fs.writeFileSync(res.filePath, JSON.stringify(payload, null, 2), 'utf-8');
      return { ok: true, path: res.filePath };
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
      const focus = raw.focus || (raw.cumulative_points !== undefined ? raw : null);
      if (!focus || focus.cumulative_points === undefined) {
        return { ok: false, error: '不是有效的备份文件' };
      }
      if (raw.settings && typeof raw.settings === 'object') {
        writeJsonSafe(SETTINGS_FILE, raw.settings);
      }
      if (raw.marks && typeof raw.marks === 'object') {
        writeJsonSafe(MARKS_FILE, raw.marks);
      }
      enqueueFocusCommand('import', { data: focus });
      return {
        ok: true,
        settings: readJsonSafe(SETTINGS_FILE),
        summary: {
          days: Object.keys(focus.days || {}).length,
          cumulative: focus.cumulative_points
        }
      };
    } catch (e) {
      console.error('导入备份失败:', e);
      return { ok: false, error: String(e) };
    }
  });

  createWindow();
  startMonitor();
  bootLog(`whenReady 完成 isDev=${isDev}`);

  process.on('uncaughtException', (err) => {
    bootLog(`未捕获异常: ${err && err.stack ? err.stack.split('\n')[0] : err}`);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

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
