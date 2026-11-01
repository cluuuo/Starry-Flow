import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import StarField from './components/StarField';
import SkyBackdrop from './components/SkyBackdrop';
import MeteorLayer from './components/MeteorLayer';
import FocusPanel from './components/FocusPanel';
import StatsBar from './components/StatsBar';
import SettingsWindow from './components/SettingsWindow';
import MarkPanel from './components/MarkPanel';
import Toast from './components/Toast';
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  logicalDateKey,
  parseDateKey,
  addDays,
  diffDays,
  toDateKey,
  tierIndex,
  tierHex,
  tierBrightness,
  tierGlow,
  backgroundVars,
  skyFlowPeriod,
  journeyMessage
} from './lib/logic';
import { generateMockDays, mockTodayPoints } from './lib/mock';

// 采集端是否已实际应用某条指令，用于在确认前保留本地乐观状态
function commandConfirmed(action, payload, state) {
  if (action === 'start') return !!state.running;
  if (action === 'pause') return !state.running;
  if (action === 'select') return (state.selected_pid || null) === ((payload && payload.pid) || null);
  if (action === 'set_strict') {
    const real = !!(state.settings && state.settings.strict && state.settings.strict.enabled);
    return real === !!(payload && payload.enabled);
  }
  return true;
}

export default function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [days, setDays] = useState({});
  const [todayPoints, setTodayPoints] = useState(0);
  const [monitorLive, setMonitorLive] = useState(false);
  const [focus, setFocus] = useState(null);
  const [notice, setNotice] = useState(null);
  const lastNoticeRef = useRef(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [startDateKey, setStartDateKey] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [marks, setMarks] = useState({});
  const [activeDay, setActiveDay] = useState(null);
  const [maximized, setMaximized] = useState(false);
  const [storageInfo, setStorageInfo] = useState(null);
  const [windowMode, setWindowMode] = useState('classic');
  const pendingCommandRef = useRef(null);

  const todayKey = logicalDateKey(new Date(), settings.dayStartMinutes);

  // 背景色设置作用到根节点，页面与卡片底色随之一致
  useEffect(() => {
    const vars = backgroundVars(settings.background);
    const root = document.documentElement;
    Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));
  }, [settings.background]);

  // 自绘标题栏：同步窗口最大化状态，用于切换「最大化 / 还原」图标
  useEffect(() => {
    const api = window.api;
    if (!api || !api.onWindowMaximized) return undefined;
    api.isWindowMaximized().then((v) => setMaximized(!!v)).catch(() => {});
    return api.onWindowMaximized((v) => setMaximized(!!v));
  }, []);

  // 显示模式：经典 / 极简（迷你模式由独立窗口渲染）
  useEffect(() => {
    const api = window.api;
    if (!api || !api.getWindowMode) return undefined;
    api.getWindowMode().then((mode) => {
      if (mode === 'classic' || mode === 'compact') setWindowMode(mode);
    }).catch(() => {});
    if (!api.onWindowMode) return undefined;
    return api.onWindowMode((mode) => {
      if (mode === 'classic' || mode === 'compact') setWindowMode(mode);
    });
  }, []);

  const switchWindowMode = useCallback(async (mode) => {
    if (!window.api || !window.api.setWindowMode) return;
    const next = await window.api.setWindowMode(mode);
    if (next === 'classic' || next === 'compact') setWindowMode(next);
  }, []);

  // 初始加载
  useEffect(() => {
    (async () => {
      let s = null;
      try {
        if (window.api) s = await window.api.getSettings();
      } catch (e) { /* 浏览器环境 */ }
      if (s) setSettings(mergeSettings(s));

      const dayStart = (s && s.dayStartMinutes) ?? DEFAULT_SETTINGS.dayStartMinutes;
      const today = logicalDateKey(new Date(), dayStart);

      let monitor = null;
      try {
        if (window.api) monitor = await window.api.getFocusState();
      } catch (e) { /* 忽略 */ }

      if (monitor) {
        const realDays = monitor.days || {};
        setFocus(monitor);
        setDays(realDays);
        setTodayPoints(realDays[today] || monitor.today_points || 0);
        setMonitorLive(true);
        const earliest = Object.keys(realDays).sort()[0];
        setStartDateKey((s && s.startDate) || earliest || today);
      } else {
        // 示例模式：以 9 天前为起点，演示渐进解锁的完整星流
        const demoStart = (s && s.startDate) || toDateKey(addDays(parseDateKey(today), -9));
        const dayNumber = diffDays(parseDateKey(demoStart), parseDateKey(today)) + 1;
        setDays(generateMockDays(demoStart, dayNumber));
        setTodayPoints(mockTodayPoints());
        setStartDateKey(demoStart);
        setDemoMode(true);
      }
      setLoaded(true);
    })();
  }, []);

  // 加载印痕
  useEffect(() => {
    (async () => {
      let m = {};
      try {
        if (window.api) m = (await window.api.getMarks()) || {};
        else m = JSON.parse(localStorage.getItem('starryflow.marks') || '{}');
      } catch (e) {
        m = {};
      }
      setMarks(m && typeof m === 'object' ? m : {});
    })();
  }, []);

  const persistMarks = useCallback((next) => {
    if (window.api) {
      window.api.setMarks(next);
    } else {
      try {
        localStorage.setItem('starryflow.marks', JSON.stringify(next));
      } catch (e) {
        /* 浏览器演示模式的容量上限，忽略即可 */
      }
    }
  }, []);

  const readMarkImage = useCallback((file) => {
    if (window.api) return window.api.readMarkImage(file);
    return Promise.resolve(null);
  }, []);

  const saveMark = useCallback(
    async ({ text, newDataUrl, removed }) => {
      const key = activeDay;
      if (!key) return;
      const old = marks[key] || {};
      let image = old.image || null;
      let imageData = old.imageData || null;

      if (removed) {
        if (image && window.api) window.api.deleteMarkImage(image);
        image = null;
        imageData = null;
      }

      if (newDataUrl) {
        if (window.api) {
          const res = await window.api.saveMarkImage({ dateKey: key, dataUrl: newDataUrl, oldFile: image });
          if (res && res.ok) {
            image = res.file;
            imageData = null;
          }
        } else {
          imageData = newDataUrl;
          image = null;
        }
      }

      const next = { ...marks };
      if (!text && !image && !imageData) delete next[key];
      else next[key] = { text, image, imageData, updatedAt: Date.now() };
      setMarks(next);
      persistMarks(next);
    },
    [activeDay, marks, persistMarks]
  );

  const deleteMark = useCallback(async () => {
    const key = activeDay;
    if (!key) return;
    const old = marks[key];
    if (old && old.image && window.api) window.api.deleteMarkImage(old.image);
    const next = { ...marks };
    delete next[key];
    setMarks(next);
    persistMarks(next);
  }, [activeDay, marks, persistMarks]);

  // 轮询采集端数据
  useEffect(() => {
    if (!window.api) return;
    const timer = setInterval(async () => {
      const state = await window.api.getFocusState();
      if (!state) return;

      // 指令尚未被采集端确认时先不覆盖本地状态，避免点击后 UI 闪回旧值
      const pending = pendingCommandRef.current;
      if (pending) {
        if (!commandConfirmed(pending.action, pending.payload, state) && Date.now() - pending.at < 1500) return;
        pendingCommandRef.current = null;
      }

      setFocus(state);
      setDays(state.days || {});
      const key = logicalDateKey(new Date(), settings.dayStartMinutes);
      setTodayPoints((state.days || {})[key] || state.today_points || 0);
      setMonitorLive(true);
      setDemoMode(false);

      const notices = state.notices || [];
      const last = notices[notices.length - 1];
      if (last && last.id !== lastNoticeRef.current) {
        lastNoticeRef.current = last.id;
        setNotice(last);
      }
    }, 400);
    return () => clearInterval(timer);
  }, [settings.dayStartMinutes]);

  // 提示条 3 秒后自动收起（底部 toast 的淡出由 CSS 动画完成）
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3600);
    return () => clearTimeout(timer);
  }, [notice]);

  // 示例模式下今日积分缓慢增长，展示实时效果
  useEffect(() => {
    if (monitorLive || !loaded) return;
    const timer = setInterval(() => {
      setTodayPoints((p) => p + 4 + Math.floor(Math.random() * 14));
    }, 2000);
    return () => clearInterval(timer);
  }, [monitorLive, loaded]);

  const handleSettingsChange = useCallback((next) => {
    setSettings(next);
    if (window.api) window.api.setSettings(next);
  }, []);

  const sendFocusCommand = useCallback((action, payload) => {
    if (!window.api) return Promise.resolve(false);

    // 点击后先本地即时反馈，真实状态随后由采集端轮询结果覆盖
    setFocus((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      if (action === 'start') {
        next.running = true;
        next.status = 'focusing';
        next.focus_lost = false;
        next.penalty_active = false;
        next.warn_message = null;
      } else if (action === 'pause') {
        next.running = false;
        next.status = 'paused';
        next.focus_lost = false;
        next.penalty_active = false;
        next.warn_message = null;
      } else if (action === 'select') {
        const pid = payload && payload.pid ? payload.pid : null;
        next.selected_pid = pid;
        next.selected_name = pid ? (payload.name || '') : null;
        next.selected_path = pid ? (payload.path || '') : null;
        next.running = false;
        if (prev.running) next.status = 'paused';
        else if (!pid) next.status = 'idle';
        next.focus_lost = false;
        next.penalty_active = false;
        next.warn_message = null;
      } else if (action === 'set_strict') {
        if (next.settings && next.settings.strict) {
          next.settings = {
            ...next.settings,
            strict: { ...next.settings.strict, enabled: !!(payload && payload.enabled) }
          };
        }
        if (!(payload && payload.enabled)) {
          next.penalty_active = false;
          next.warn_message = null;
        }
      }
      return next;
    });

    if (action === 'start' || action === 'pause' || action === 'select' || action === 'set_strict') {
      pendingCommandRef.current = { action, payload, at: Date.now() };
    }

    return window.api.sendFocusCommand(action, payload);
  }, []);

  const handleBackupExport = useCallback(() => {
    if (!window.api) return Promise.resolve({ ok: false, error: '仅桌面端可用' });
    return window.api.exportBackup();
  }, []);

  const handleBackupImport = useCallback(async () => {
    if (!window.api) return { ok: false, error: '仅桌面端可用' };
    const res = await window.api.importBackup();
    if (res && res.ok) {
      if (res.settings) setSettings(mergeSettings(res.settings));
      try {
        const m = (await window.api.getMarks()) || {};
        setMarks(m);
      } catch (e) { /* 忽略 */ }
      setNotice({ id: Date.now(), ok: true, message: '备份已导入，采集已暂停，请重新选择进程。' });
    }
    return res;
  }, []);

  // 数据存储位置：仅桌面端可用，路径保存在主进程的 storage.json 中
  const refreshStorageInfo = useCallback(async () => {
    if (!window.api || !window.api.getStorageInfo) return;
    try {
      setStorageInfo(await window.api.getStorageInfo());
    } catch (e) { /* 忽略 */ }
  }, []);

  const handleOpenStorage = useCallback((kind) => {
    if (!window.api || !window.api.openStoragePath) return Promise.resolve({ ok: false, error: '仅桌面端可用' });
    return window.api.openStoragePath(kind);
  }, []);

  const handleChooseStorage = useCallback(async (kind) => {
    if (!window.api || !window.api.chooseStorageDir) return { ok: false, error: '仅桌面端可用' };
    const res = await window.api.chooseStorageDir(kind);
    if (res && res.ok && res.info) setStorageInfo(res.info);
    return res;
  }, []);

  const handleResetStorage = useCallback(async (kind) => {
    if (!window.api || !window.api.resetStorageDir) return { ok: false, error: '仅桌面端可用' };
    const res = await window.api.resetStorageDir(kind);
    if (res && res.ok && res.info) setStorageInfo(res.info);
    return res;
  }, []);

  const handleRestartApp = useCallback(() => {
    if (window.api && window.api.restartApp) window.api.restartApp();
  }, []);

  // 仅示例模式：跳转到旅程第 N 天，便于查验各阶段解锁效果
  const jumpToDemoDay = useCallback((n) => {
    const demoStart = toDateKey(addDays(parseDateKey(todayKey), -(n - 1)));
    setStartDateKey(demoStart);
    setDays(generateMockDays(demoStart, n));
  }, [todayKey]);

  // 当日累计 = 今日已结算部分 + 本轮实时积分；与「总获积分池」区分开
  const todaySettled = (focus?.settled && focus.settled[todayKey]) || 0;

  // 星点显示「当日已结算部分 + 本轮新积分」：结算后颜色保留，同日多轮专注继续叠加亮度
  const displayDays = useMemo(() => {
    const settled = focus?.settled || {};
    const out = { ...days };
    Object.keys(settled).forEach((k) => {
      out[k] = (out[k] || 0) + (settled[k] || 0);
    });
    out[todayKey] = todayPoints + (settled[todayKey] || 0);
    return out;
  }, [days, focus?.settled, todayKey, todayPoints]);

  // 统计只覆盖本次旅程（起始日之后），重新开始时同步归零
  const scopedDays = useMemo(() => {
    if (!startDateKey) return displayDays;
    const out = {};
    for (const [k, v] of Object.entries(displayDays)) {
      if (k >= startDateKey) out[k] = v;
    }
    return out;
  }, [displayDays, startDateKey]);

  const dayNumber = startDateKey
    ? Math.max(1, diffDays(parseDateKey(startDateKey), parseDateKey(todayKey)) + 1)
    : 1;
  const weekCount = Math.ceil(dayNumber / 7);
  const msg = journeyMessage(dayNumber, weekCount);

  // 夜空流动速度：今日档位越高，周期越短
  const todayLevel = tierIndex(todayPoints, settings.tiers);
  const skySpeed = settings.sky.followPoints ? 1 + Math.max(0, todayLevel) * 0.3 : 1;
  const skyDuration = skyFlowPeriod(settings.sky.flowSpeed) / skySpeed;

  // 标题渐变跟随主题色与各档位色：档位色变了，标题同步变化
  const titleTiers = useMemo(
    () => settings.tiers.map((t, i) => tierHex(settings.starColor, i, t)),
    [settings.tiers, settings.starColor]
  );

  return (
    <div
      className={`app${windowMode === 'compact' ? ' mode-compact' : ''}`}
      style={{
        '--accent': settings.starColor,
        '--tier-1': titleTiers[0],
        '--tier-2': titleTiers[1],
        '--tier-3': titleTiers[2],
        '--tier-4': titleTiers[3],
        '--tier-5': titleTiers[4]
      }}
    >
      {/* 无边框窗口的顶部拖拽区，与下方 header 一起构成自绘标题栏 */}
      <div className="titlebar-strip" />
      <header className="app-header">
        <div className="app-title">
          <img className="app-logo" src="./icon.png" alt="" />
          <div>
            <h1>Starry Flow</h1>
            <p>星流 · 专注目标与进度可视化</p>
          </div>
        </div>
        <div className="header-right">
          {demoMode && <span className="demo-tag">示例数据</span>}
          {windowMode !== 'compact' && (
            <button className="settings-btn" onClick={() => setDrawerOpen(true)}>
              ⚙ 设置
            </button>
          )}
          {window.api && (
            <>
              {windowMode === 'compact' ? (
                <button className="mode-btn" onClick={() => switchWindowMode('classic')}>
                  经典模式
                </button>
              ) : (
                <button className="mode-btn" onClick={() => switchWindowMode('compact')}>
                  极简模式
                </button>
              )}
              <button className="mode-btn" onClick={() => switchWindowMode('mini')}>
                迷你模式
              </button>
            </>
          )}
          {window.api && (
            <div className="win-controls">
              <button
                className="win-btn"
                title="最小化"
                aria-label="最小化"
                onClick={() => window.api.windowControl('minimize')}
              >
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M2.5 6h7" />
                </svg>
              </button>
              <button
                className="win-btn"
                title={maximized ? '还原' : '最大化'}
                aria-label={maximized ? '还原' : '最大化'}
                onClick={() => window.api.windowControl('maximize')}
              >
                {maximized ? (
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M4.5 4.5h5v5h-5z" />
                    <path d="M2.5 7.5v-5h5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <rect x="2.5" y="2.5" width="7" height="7" />
                  </svg>
                )}
              </button>
              <button
                className="win-btn win-close"
                title="关闭"
                aria-label="关闭"
                onClick={() => window.api.windowControl('close')}
              >
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M3 3l6 6M9 3l-6 6" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>

      <FocusPanel
        focus={focus}
        todayPoints={todayPoints}
        todayTotal={todayPoints + todaySettled}
        tiers={settings.tiers}
        starColor={settings.starColor}
        connected={!!focus}
        onCommand={sendFocusCommand}
        motion={settings.starMotion}
        sky={{
          density: settings.sky.density,
          duration: skyDuration,
          animated: settings.sky.animated !== false
        }}
        variant={windowMode === 'compact' ? 'compact' : 'classic'}
      />

      {windowMode !== 'compact' && (
      <div className="card star-card">
        <SkyBackdrop
          density={settings.sky.density}
          duration={skyDuration}
          animated={settings.sky.animated !== false}
        />
        <MeteorLayer enabled={settings.sky.animated !== false} />
        <div className="star-card-head">
          <div className="journey-message">
            <div className="journey-title">{msg.title}</div>
            <div className="journey-sub">{msg.sub}</div>
          </div>
          <div className="legend">
            <span className="legend-text">微光</span>
            <span className="legend-cell" style={{ backgroundColor: 'var(--cell-empty)' }} />
            {settings.tiers.map((t, i) => (
              <span
                key={i}
                className="legend-cell"
                style={{
                  backgroundColor: tierHex(settings.starColor, i, t),
                  filter: `brightness(${tierBrightness(t, i)}) drop-shadow(0 0 ${(2 + tierGlow(t, i) * 7).toFixed(1)}px ${tierHex(settings.starColor, i, t)})`
                }}
              />
            ))}
            <span className="legend-text">璀璨</span>
          </div>
        </div>

        {loaded && startDateKey && (
          <StarField
            days={displayDays}
            tiers={settings.tiers}
            todayKey={todayKey}
            startDateKey={startDateKey}
            settings={settings}
            marks={marks}
            onSelectDay={setActiveDay}
          />
        )}

        <div className="star-card-foot">
          <span>今天是第 {dayNumber} 天 · 第 {weekCount} 周</span>
          <span className="foot-tip">点击任意点亮的星点，留下那一天的印痕</span>
        </div>

        {demoMode && loaded && (
          <div className="demo-jump">
            <span className="demo-jump-label">示例预览</span>
            {[1, 2, 3, 7, 8, 15, 22].map((n) => (
              <button
                key={n}
                className={`demo-jump-btn ${dayNumber === n ? 'on' : ''}`}
                onClick={() => jumpToDemoDay(n)}
              >
                第 {n} 天
              </button>
            ))}
          </div>
        )}
      </div>
      )}

      {windowMode !== 'compact' && (
      <StatsBar
        days={scopedDays}
        todayKey={todayKey}
        dayStartMinutes={settings.dayStartMinutes}
        tiers={settings.tiers}
      />
      )}

      <SettingsWindow
        open={drawerOpen}
        settings={settings}
        onChange={handleSettingsChange}
        onClose={() => setDrawerOpen(false)}
        focus={focus}
        onFocusCommand={sendFocusCommand}
        onBackupExport={handleBackupExport}
        onBackupImport={handleBackupImport}
        storageInfo={storageInfo}
        onRefreshStorage={refreshStorageInfo}
        onOpenStorage={handleOpenStorage}
        onChooseStorage={handleChooseStorage}
        onResetStorage={handleResetStorage}
        onRestartApp={handleRestartApp}
      />

      {activeDay && (
        <MarkPanel
          key={activeDay}
          dateKey={activeDay}
          points={displayDays[activeDay] || 0}
          mark={marks[activeDay] || null}
          tiers={settings.tiers}
          starColor={settings.starColor}
          isToday={activeDay === todayKey}
          onSave={saveMark}
          onDelete={deleteMark}
          onClose={() => setActiveDay(null)}
          readImage={readMarkImage}
        />
      )}

      <Toast notice={notice} />
    </div>
  );
}
