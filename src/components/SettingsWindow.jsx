import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { minutesToTimeStr, timeStrToMinutes, DEFAULT_SETTINGS, tierBrightness, tierGlow, tierHex, hsvToHex, hexToRgb } from '../lib/logic';
import WhitelistPicker from './WhitelistPicker';
import WebdavPanel from './WebdavPanel';

const SHAPES = [
  { id: 'star4', label: '四芒星' },
  { id: 'circle', label: '圆形' },
  { id: 'rounded', label: '圆角矩形' }
];

// 采集端未启动时，规则页仍显示一份可读的默认值
const FALLBACK_FOCUS = {
  base_points_per_sec: 3,
  acceleration_enabled: true,
  acceleration_segments: [[20, 3], [40, 4], [60, 5], [90, 7]],
  exchange_rate: 1000,
  allowance_name: '随心额度',
  strict: { enabled: false, points_per_sec: 14, punish_points: 3, threshold: 15000 }
};

export default function SettingsWindow({
  open,
  settings,
  onChange,
  onClose,
  focus,
  onFocusCommand,
  onBackupExport,
  onBackupImport,
  onWebdavRestored,
  storageInfo,
  onRefreshStorage,
  onOpenStorage,
  onChooseStorage,
  onResetStorage,
  onRestartApp
}) {
  const [tab, setTab] = useState(() => {
    const saved = settings.settingsTab;
    return ['rules', 'exchange', 'backup', 'psychology'].includes(saved) ? saved : 'appearance';
  });
  const [exchangeAmount, setExchangeAmount] = useState(1);
  const [spendAmount, setSpendAmount] = useState(1);
  const [backupMsg, setBackupMsg] = useState(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [storageBusy, setStorageBusy] = useState(null);
  const [storageMsg, setStorageMsg] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [whitelistOpen, setWhitelistOpen] = useState(false);
  const [debugUnlocked, setDebugUnlocked] = useState(false);
  const [pointsDelta, setPointsDelta] = useState('');
  const [allowanceDelta, setAllowanceDelta] = useState('');
  const [previewOn, setPreviewOn] = useState(false);

  // 窗口高度跟随当前页内容：切换标签时用 CSS 过渡平滑改变，避免突然跳尺寸
  const winRef = useRef(null);
  const pageRef = useRef(null);
  const firstMeasureRef = useRef(true);
  const [winHeight, setWinHeight] = useState(null);

  useLayoutEffect(() => {
    if (!open) {
      firstMeasureRef.current = true;
      setWinHeight(null);
      return undefined;
    }
    const win = winRef.current;
    const page = pageRef.current;
    if (!win || !page) return undefined;

    const measure = () => {
      const head = win.querySelector('.settings-head');
      const tabs = win.querySelector('.settings-tabs');
      const foot = win.querySelector('.settings-foot');
      const body = win.querySelector('.settings-body');
      if (!head || !tabs || !foot || !body) return;
      const cs = getComputedStyle(body);
      const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const chrome = head.offsetHeight + tabs.offsetHeight + foot.offsetHeight + pad;
      const maxHeight = Math.round(window.innerHeight * 0.86);
      const next = Math.min(Math.round(chrome + page.offsetHeight), maxHeight);
      if (firstMeasureRef.current) {
        // 首次打开直接落到目标高度，只有切换标签才播放过渡
        win.style.transition = 'none';
        setWinHeight(next);
        requestAnimationFrame(() => {
          win.style.transition = '';
          firstMeasureRef.current = false;
        });
      } else {
        setWinHeight(next);
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [open, tab]);

  // 打开「备份与恢复」时重新读一次路径，避免显示切换前缓存的旧值
  useEffect(() => {
    if (open && tab === 'backup' && onRefreshStorage) onRefreshStorage();
  }, [open, tab, onRefreshStorage]);

  // 预览只在「外观设置」里有效：关掉设置或切到别的标签页就收起迷你窗口
  useEffect(() => {
    if (!open || tab !== 'appearance') {
      if (previewOn) {
        setPreviewOn(false);
        if (window.api && window.api.setMiniPreview) window.api.setMiniPreview(false);
      }
    }
  }, [open, tab, previewOn]);

  if (!open) return null;

  const update = (patch) => onChange({ ...settings, ...patch });

  const psych = settings.psychology || DEFAULT_SETTINGS.psychology;
  const sleepCfg = psych.healthySleep;
  const pactCfg = psych.pact;
  const updatePsych = (patch) => update({ psychology: { ...psych, ...patch } });
  const resetSleep = () => updatePsych({
    healthySleep: JSON.parse(JSON.stringify(DEFAULT_SETTINGS.psychology.healthySleep))
  });
  const resetPact = () => updatePsych({
    pact: JSON.parse(JSON.stringify(DEFAULT_SETTINGS.psychology.pact))
  });

  const miniCfg = settings.mini || DEFAULT_SETTINGS.mini;
  const updateMini = (patch) => update({ mini: { ...miniCfg, ...patch } });

  // 预览开关：弹出真实的迷你窗口，主窗口保持显示，改动即时可见
  const togglePreview = async () => {
    const next = !previewOn;
    setPreviewOn(next);
    if (window.api && window.api.setMiniPreview) await window.api.setMiniPreview(next);
  };
  const miniBg = hexToRgb(hsvToHex(miniCfg.bgHue, miniCfg.bgSaturation, miniCfg.bgValue));
  const miniBgRgba = `rgba(${miniBg.r},${miniBg.g},${miniBg.b},${(miniCfg.bgAlpha / 100).toFixed(2)})`;

  const special = settings.specialWhitelist || DEFAULT_SETTINGS.specialWhitelist;
  const updateSpecial = (patch) => update({ specialWhitelist: { ...special, ...patch } });
  const whitelistKey = (item) => (
    item.self ? '__self__' : (item.path || `name:${item.name || ''}`).toLowerCase()
  );
  const removeWhitelistItem = (item) => {
    const key = whitelistKey(item);
    updateSpecial({ items: special.items.filter((it) => whitelistKey(it) !== key) });
  };

  const switchTab = (next) => {
    setTab(next);
    update({ settingsTab: next });
    // 切换页面后回到顶部，避免停在上一个页面滚动到的位置
    const body = winRef.current && winRef.current.querySelector('.settings-body');
    if (body) body.scrollTop = 0;
  };

  const resetKeys = (keys) => {
    const patch = {};
    keys.forEach((k) => { patch[k] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[k])); });
    update(patch);
  };

  const resetFocusRules = () => {
    const d = JSON.parse(JSON.stringify(FALLBACK_FOCUS));
    updateFocus({
      base_points_per_sec: d.base_points_per_sec,
      acceleration_enabled: d.acceleration_enabled,
      acceleration_segments: d.acceleration_segments,
      strict: d.strict
    });
  };

  const resetExchange = () => {
    updateFocus({
      exchange_rate: FALLBACK_FOCUS.exchange_rate,
      allowance_name: FALLBACK_FOCUS.allowance_name
    });
  };

  // 数据调试：直接增减已结算积分与额度，正负皆可
  const applyDebug = (patch) => {
    if (!onFocusCommand) return;
    onFocusCommand('adjust_totals', { points: 0, allowance: 0, ...patch });
    setPointsDelta('');
    setAllowanceDelta('');
  };

  const bg = settings.background || DEFAULT_SETTINGS.background;
  const updateBg = (patch) => update({ background: { ...bg, ...patch } });

  const fset = focus?.settings || FALLBACK_FOCUS;
  const strict = fset.strict;
  const allowanceName = fset.allowance_name;
  const allowance = focus?.allowance || 0;
  const cumulative = focus?.cumulative_points || 0;
  // 当前可用积分按兑换比例最多能换多少额度
  const exchangeRate = Math.max(1, Math.round(Number(fset.exchange_rate) || 1));
  const maxExchange = Math.floor(cumulative / exchangeRate);

  const updateFocus = (patch) => {
    if (!onFocusCommand) return;
    onFocusCommand('update_settings', { settings: { ...fset, ...patch } });
  };
  const updateStrict = (patch) => updateFocus({ strict: { ...strict, ...patch } });

  const updateSegment = (index, field, value) => {
    const segs = fset.acceleration_segments.map((seg, i) => {
      if (i !== index) return seg;
      return field === 'end' ? [value, seg[1]] : [seg[0], value];
    });
    updateFocus({ acceleration_segments: segs });
  };

  const handleExport = async () => {
    if (!onBackupExport) return;
    setBackupBusy(true);
    const res = await onBackupExport();
    setBackupBusy(false);
    if (res?.canceled) return;
    setBackupMsg(res?.ok
      ? { ok: true, text: `已导出到：${res.path}` }
      : { ok: false, text: res?.error || '导出失败' });
  };

  const handleImport = async () => {
    if (!onBackupImport) return;
    setBackupBusy(true);
    const res = await onBackupImport();
    setBackupBusy(false);
    if (res?.canceled) return;
    setBackupMsg(res?.ok
      ? { ok: true, text: `已导入 ${res.summary?.days || 0} 天记录，已结算积分 ${res.summary?.cumulative ?? 0}。` }
      : { ok: false, text: res?.error || '导入失败' });
  };

  const updateTier = (i, patch) => {
    const tiers = settings.tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t));
    update({ tiers });
  };

  // 数据位置：选择后先把现有数据复制过去，重启应用才真正切换
  const handleOpenStorage = async (kind) => {
    if (!onOpenStorage) return;
    const res = await onOpenStorage(kind);
    if (res && res.ok === false && !res.canceled) {
      setStorageMsg({ ok: false, text: res.error || '无法打开该路径' });
    }
  };

  const handleChooseStorage = async (kind) => {
    if (!onChooseStorage || storageBusy) return;
    setStorageBusy(kind);
    const res = await onChooseStorage(kind);
    setStorageBusy(null);
    if (res?.canceled) return;
    setStorageMsg(res?.ok
      ? { ok: true, text: '路径已更新，现有数据已复制到新位置，重启应用后生效。' }
      : { ok: false, text: res?.error || '更改路径失败' });
  };

  const handleResetStorage = async (kind) => {
    if (!onResetStorage || storageBusy) return;
    setStorageBusy(kind);
    const res = await onResetStorage(kind);
    setStorageBusy(null);
    if (res?.canceled) return;
    setStorageMsg(res?.ok
      ? { ok: true, text: '已恢复默认位置，数据已复制回默认目录，重启应用后生效。' }
      : { ok: false, text: res?.error || '恢复默认失败' });
  };

  const updateMotion = (patch) => update({ starMotion: { ...settings.starMotion, ...patch } });
  const updateOrbit = (patch) => update({ orbit: { ...settings.orbit, ...patch } });
  const updateSky = (patch) => update({ sky: { ...settings.sky, ...patch } });

  return (
    <div className="settings-mask" onClick={onClose}>
      <div
        className="settings-window"
        ref={winRef}
        style={winHeight ? { height: `${winHeight}px` } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-head">
          <span>设置</span>
          <button className="settings-close" onClick={onClose}>×</button>
        </div>

        <div className="settings-tabs">
          <button
            className={`settings-tab ${tab === 'appearance' ? 'on' : ''}`}
            onClick={() => switchTab('appearance')}
          >
            外观设置
          </button>
          <button
            className={`settings-tab ${tab === 'rules' ? 'on' : ''}`}
            onClick={() => switchTab('rules')}
          >
            规则设置
          </button>
          <button
            className={`settings-tab ${tab === 'exchange' ? 'on' : ''}`}
            onClick={() => switchTab('exchange')}
          >
            积分兑换
          </button>
          <button
            className={`settings-tab ${tab === 'psychology' ? 'on' : ''}`}
            onClick={() => switchTab('psychology')}
          >
            契约激活
          </button>
          <button
            className={`settings-tab ${tab === 'backup' ? 'on' : ''}`}
            onClick={() => switchTab('backup')}
          >
            备份与恢复
          </button>
        </div>

        <div className="settings-body">
          <div className="settings-page" ref={pageRef}>
          {tab === 'appearance' && (
            <div className="settings-grid">
              <div className="settings-section">
                <div className="settings-title-row">
                  <div className="settings-title">软件背景</div>
                  <button className="settings-reset-mini" onClick={() => resetKeys(['background'])}>恢复默认</button>
                </div>
                <p className="settings-desc">
                  大面积夜空的底色。降低饱和度可以让画面更柔和，长时间看着不累眼。
                </p>

                <div className="field-row">
                  <label>当前颜色</label>
                  <span
                    className="bg-preview"
                    style={{ backgroundColor: hsvToHex(bg.hue, bg.saturation, bg.value) }}
                  />
                  <span className="field-hint">
                    色相 {bg.hue}° · 饱和 {bg.saturation}% · 明度 {bg.value}%
                  </span>
                </div>

                <div className="field-row">
                  <label>色相</label>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={1}
                    value={bg.hue}
                    onChange={(e) => updateBg({ hue: Number(e.target.value) })}
                  />
                  <span className="field-value">{bg.hue}°</span>
                </div>

                <div className="field-row">
                  <label>饱和度</label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={bg.saturation}
                    onChange={(e) => updateBg({ saturation: Number(e.target.value) })}
                  />
                  <span className="field-value">{bg.saturation}%</span>
                </div>

                <div className="field-row">
                  <label>明度</label>
                  <input
                    type="range"
                    min={4}
                    max={30}
                    step={1}
                    value={bg.value}
                    onChange={(e) => updateBg({ value: Number(e.target.value) })}
                  />
                  <span className="field-value">{bg.value}%</span>
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-title-row">
                  <div className="settings-title">星点外观</div>
                  <button className="settings-reset-mini" onClick={() => resetKeys(['starShape', 'starColor'])}>恢复默认</button>
                </div>
                <p className="settings-desc">星点是每日积分的化身，形状与颜色都可按喜好调整。</p>

                <div className="field-row field-col">
                  <label>形状</label>
                  <div className="shape-picker">
                    {SHAPES.map((s) => (
                      <button
                        key={s.id}
                        className={`shape-btn ${settings.starShape === s.id ? 'on' : ''}`}
                        onClick={() => update({ starShape: s.id })}
                      >
                        <svg viewBox="0 0 100 100" className="shape-icon">
                          {s.id === 'star4' && (
                            <path
                              d="M50 8 C55 33 67 45 92 50 C67 55 55 67 50 92 C45 67 33 55 8 50 C33 45 45 33 50 8 Z"
                              fill="currentColor"
                              stroke="currentColor"
                              strokeWidth="7"
                              strokeLinejoin="round"
                            />
                          )}
                          {s.id === 'circle' && <circle cx="50" cy="50" r="44" fill="currentColor" />}
                          {s.id === 'rounded' && <rect x="6" y="6" width="88" height="88" rx="26" fill="currentColor" />}
                        </svg>
                        <span>{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field-row">
                  <label>颜色</label>
                  <input
                    type="color"
                    value={settings.starColor}
                    onChange={(e) => update({ starColor: e.target.value })}
                  />
                  <span className="field-hint">积分越高越明亮</span>
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-title-row">
                  <div className="settings-title">星点漂浮</div>
                  <button className="settings-reset-mini" onClick={() => resetKeys(['starMotion'])}>恢复默认</button>
                </div>
                <p className="settings-desc">让星点在原位附近轻轻游移，幅度过大会显得晃动；档位越高晃动越快。</p>

                <div className="field-row">
                  <span className="field-label-group">
                    <label>启用漂浮动效</label>
                    {settings.starMotion.enabled && (
                      <span className="field-note">开启后可能增加性能负载</span>
                    )}
                  </span>
                  <button
                    className={`switch ${settings.starMotion.enabled ? 'on' : ''}`}
                    onClick={() => updateMotion({ enabled: !settings.starMotion.enabled })}
                  >
                    <span className="switch-knob" />
                  </button>
                </div>

                <div className="field-row">
                  <label>幅度</label>
                  <input
                    type="range"
                    min={0}
                    max={12}
                    step={0.5}
                    value={settings.starMotion.amplitude}
                    disabled={!settings.starMotion.enabled}
                    onChange={(e) => updateMotion({ amplitude: Number(e.target.value) })}
                  />
                  <span className="field-value">{settings.starMotion.amplitude}px</span>
                </div>

                <div className="field-row">
                  <label>速度</label>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={settings.starMotion.speed}
                    disabled={!settings.starMotion.enabled}
                    onChange={(e) => updateMotion({ speed: Number(e.target.value) })}
                  />
                  <span className="field-value">{settings.starMotion.speed} 档</span>
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-title-row">
                  <div className="settings-title">印痕环绕</div>
                  <button className="settings-reset-mini" onClick={() => resetKeys(['orbit'])}>恢复默认</button>
                </div>
                <p className="settings-desc">有印痕的星点周围有一颗卫星沿轨道环绕；关闭后改为在星点右下角显示一个光点，仍会标示哪些日期留有印痕。</p>

                <div className="field-row">
                  <span className="field-label-group">
                    <label>启用环绕动效</label>
                    {settings.orbit.enabled && (
                      <span className="field-note">开启后可能增加性能负载</span>
                    )}
                  </span>
                  <button
                    className={`switch ${settings.orbit.enabled ? 'on' : ''}`}
                    onClick={() => updateOrbit({ enabled: !settings.orbit.enabled })}
                  >
                    <span className="switch-knob" />
                  </button>
                </div>

                <div className="field-row">
                  <label>环绕速度</label>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={settings.orbit.speed}
                    disabled={!settings.orbit.enabled}
                    onChange={(e) => updateOrbit({ speed: Number(e.target.value) })}
                  />
                  <span className="field-value">{settings.orbit.speed} 档</span>
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-title-row">
                  <div className="settings-title">夜空</div>
                  <button className="settings-reset-mini" onClick={() => resetKeys(['sky'])}>恢复默认</button>
                </div>
                <p className="settings-desc">
                  背景星野缓慢流动，流星偶尔划过。默认今日积分越高，流动越快；关闭动态后星空静止，星星仍然显示。
                </p>

                <div className="field-row">
                  <span className="field-label-group">
                    <label>启用动态星空效果</label>
                    {settings.sky.animated !== false && (
                      <span className="field-note">开启后可能增加性能负载</span>
                    )}
                  </span>
                  <button
                    className={`switch ${settings.sky.animated !== false ? 'on' : ''}`}
                    onClick={() => updateSky({ animated: settings.sky.animated === false })}
                  >
                    <span className="switch-knob" />
                  </button>
                </div>

                <div className="field-row">
                  <label>星星密度</label>
                  <input
                    type="range"
                    min={0.4}
                    max={2}
                    step={0.1}
                    value={settings.sky.density}
                    onChange={(e) => updateSky({ density: Number(e.target.value) })}
                  />
                  <span className="field-value">{settings.sky.density.toFixed(1)}×</span>
                </div>

                <div className="field-row">
                  <label>随积分加快</label>
                  <button
                    className={`switch ${settings.sky.followPoints ? 'on' : ''}`}
                    disabled={settings.sky.animated === false}
                    onClick={() => updateSky({ followPoints: !settings.sky.followPoints })}
                  >
                    <span className="switch-knob" />
                  </button>
                </div>

                <div className="field-row">
                  <label>流动速度</label>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={settings.sky.flowSpeed}
                    disabled={settings.sky.animated === false}
                    onChange={(e) => updateSky({ flowSpeed: Number(e.target.value) })}
                  />
                  <span className="field-value">{settings.sky.flowSpeed} 档</span>
                </div>
              </div>

              <div className="settings-section settings-wide">
                <div className="settings-title-row">
                  <div className="settings-title">迷你模式</div>
                  <div className="mini-preview-actions">
                    <div className="mini-preview-toggle">
                      <span>预览</span>
                      <button
                        className={`switch ${previewOn ? 'on' : ''}`}
                        onClick={togglePreview}
                        title="弹出迷你窗口，实时查看改动"
                      >
                        <span className="switch-knob" />
                      </button>
                    </div>
                    <button className="settings-reset-mini" onClick={() => resetKeys(['mini'])}>恢复默认</button>
                  </div>
                </div>
                <p className="settings-desc">
                  迷你模式是透明浮窗，这里的设置只影响它。窗口大小会跟随下面的宽高，鼠标判定范围与面板一致。
                  打开预览会单独弹出迷你窗口，调哪里就能看到哪里；关闭设置页或切到别的标签会自动收起。
                </p>

                <div className="mini-settings">
                  <div className="mini-settings-col">
                    <div className="settings-caption">面板背景</div>

                    <div className="field-row">
                      <label>当前颜色</label>
                      <span
                        className="bg-preview"
                        style={{ backgroundColor: miniBgRgba }}
                      />
                      <span className="field-hint">
                        色相 {miniCfg.bgHue}° · 饱和 {miniCfg.bgSaturation}% · 明度 {miniCfg.bgValue}%
                      </span>
                    </div>

                    <div className="field-row">
                      <label>色相</label>
                      <input
                        type="range"
                        min={0}
                        max={360}
                        step={1}
                        value={miniCfg.bgHue}
                        onChange={(e) => updateMini({ bgHue: Number(e.target.value) })}
                      />
                      <span className="field-value">{miniCfg.bgHue}°</span>
                    </div>

                    <div className="field-row">
                      <label>饱和度</label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={miniCfg.bgSaturation}
                        onChange={(e) => updateMini({ bgSaturation: Number(e.target.value) })}
                      />
                      <span className="field-value">{miniCfg.bgSaturation}%</span>
                    </div>

                    <div className="field-row">
                      <label>明度</label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={miniCfg.bgValue}
                        onChange={(e) => updateMini({ bgValue: Number(e.target.value) })}
                      />
                      <span className="field-value">{miniCfg.bgValue}%</span>
                    </div>

                    <div className="field-row">
                      <label>不透明度</label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={miniCfg.bgAlpha}
                        onChange={(e) => updateMini({ bgAlpha: Number(e.target.value) })}
                      />
                      <span className="field-value">{miniCfg.bgAlpha}%</span>
                    </div>

                    <div className="field-row">
                      <label>宽度</label>
                      <input
                        type="number"
                        className="focus-number-input"
                        min={140}
                        max={420}
                        step={4}
                        value={miniCfg.width}
                        onChange={(e) => updateMini({
                          width: Math.max(140, Math.min(420, Math.round(Number(e.target.value) || 140)))
                        })}
                      />
                      <span className="field-hint">px</span>
                    </div>

                    <div className="field-row">
                      <label>高度</label>
                      <input
                        type="number"
                        className="focus-number-input"
                        min={140}
                        max={400}
                        step={4}
                        value={miniCfg.height}
                        onChange={(e) => updateMini({
                          height: Math.max(140, Math.min(400, Math.round(Number(e.target.value) || 140)))
                        })}
                      />
                      <span className="field-hint">px</span>
                    </div>
                  </div>

                  <div className="mini-settings-col">
                    <div className="settings-caption">星点与积分</div>

                    <div className="field-row">
                      <label>星点跟随档位颜色</label>
                      <button
                        className={`switch ${miniCfg.starFollowTier ? 'on' : ''}`}
                        onClick={() => updateMini({ starFollowTier: !miniCfg.starFollowTier })}
                      >
                        <span className="switch-knob" />
                      </button>
                    </div>

                    <div className="field-row">
                      <label>积分数字跟随档位颜色</label>
                      <button
                        className={`switch ${miniCfg.numberFollowTier ? 'on' : ''}`}
                        onClick={() => updateMini({ numberFollowTier: !miniCfg.numberFollowTier })}
                      >
                        <span className="switch-knob" />
                      </button>
                    </div>

                    <div className="settings-caption">阴影</div>

                    <div className="field-row">
                      <label>阴影颜色</label>
                      <input
                        type="color"
                        value={miniCfg.shadowColor}
                        onChange={(e) => updateMini({ shadowColor: e.target.value })}
                      />
                      <span className="field-hint">同时作用于星点与数字</span>
                    </div>

                    <div className="field-row">
                      <label>阴影深度</label>
                      <input
                        type="range"
                        min={0}
                        max={16}
                        step={1}
                        value={miniCfg.shadowDepth}
                        onChange={(e) => updateMini({ shadowDepth: Number(e.target.value) })}
                      />
                      <span className="field-value">{miniCfg.shadowDepth}px</span>
                    </div>

                    <div className="field-row">
                      <label>阴影范围</label>
                      <input
                        type="range"
                        min={0}
                        max={40}
                        step={1}
                        value={miniCfg.shadowBlur}
                        onChange={(e) => updateMini({ shadowBlur: Number(e.target.value) })}
                      />
                      <span className="field-value">{miniCfg.shadowBlur}px</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="settings-section settings-wide">
                <div className="settings-title-row">
                  <div className="settings-title">积分档位</div>
                  <button className="settings-reset-mini" onClick={() => resetKeys(['tiers'])}>恢复默认</button>
                </div>
                <p className="settings-desc">当日积分达到阈值即点亮更亮的一级；L1 为有效签到线。</p>
                <div className="tier-grid">
                  {settings.tiers.map((t, i) => (
                    <div key={i} className="tier-block">
                      <div className="tier-line">
                        <span className="tier-name">L{i + 1}</span>
                        <input
                          type="number"
                          className="tier-points"
                          value={t.points}
                          min={0}
                          step={100}
                          onChange={(e) => updateTier(i, { points: Math.max(0, Number(e.target.value)) })}
                        />
                        <span className="tier-unit">积分</span>
                        <input
                          type="color"
                          className="tier-color"
                          value={tierHex(settings.starColor, i, t)}
                          onChange={(e) => updateTier(i, { color: e.target.value })}
                        />
                        <span
                          className="tier-preview"
                          style={{
                            backgroundColor: tierHex(settings.starColor, i, t),
                            filter: `brightness(${tierBrightness(t, i).toFixed(2)})`,
                            boxShadow: `0 0 ${(2 + tierGlow(t, i) * 7).toFixed(1)}px ${tierHex(settings.starColor, i, t)}`
                          }}
                        />
                      </div>
                      <div className="tier-line">
                        <span className="tier-sub">明度</span>
                        <input
                          type="range"
                          min={0.3}
                          max={2.4}
                          step={0.02}
                          value={tierBrightness(t, i)}
                          onChange={(e) => updateTier(i, { brightness: Number(e.target.value) })}
                        />
                        <span className="field-value">{tierBrightness(t, i).toFixed(2)}</span>
                      </div>
                      <div className="tier-line">
                        <span className="tier-sub">发光</span>
                        <input
                          type="range"
                          min={0}
                          max={2.5}
                          step={0.05}
                          value={tierGlow(t, i)}
                          onChange={(e) => updateTier(i, { glow: Number(e.target.value) })}
                        />
                        <span className="field-value">{tierGlow(t, i).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'rules' && (
            <div className="settings-grid">
              <div className="settings-section">
                <div className="settings-title-row">
                  <div className="settings-title">当日判定</div>
                  <button className="settings-reset-mini" onClick={() => resetKeys(['dayStartMinutes', 'settleMinutes'])}>恢复默认</button>
                </div>
                <p className="settings-desc">
                  从「新一天开始」到次日「结算封存」之间的活动都算作同一天。
                  例：默认 07:00 开始、次日 04:00 封存，则今晚 20:00 熬夜到 01:00 的积分都计入今天。
                </p>
                <div className="field-row">
                  <label>新一天开始</label>
                  <input
                    type="time"
                    value={minutesToTimeStr(settings.dayStartMinutes)}
                    onChange={(e) => update({ dayStartMinutes: timeStrToMinutes(e.target.value) })}
                  />
                </div>
                <div className="field-row">
                  <label>结算封存</label>
                  <input
                    type="time"
                    value={minutesToTimeStr(settings.settleMinutes)}
                    onChange={(e) => update({ settleMinutes: timeStrToMinutes(e.target.value) })}
                  />
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-title-row">
                  <div className="settings-title">进程监控</div>
                  <button className="settings-reset-mini" onClick={() => resetKeys(['maxWorkGroups', 'selfWhitelist'])}>恢复默认</button>
                </div>
                <p className="settings-desc">
                  可同时勾选两个进程作为专注目标，焦点停留在任一进程都算专注。
                  最近用过的双进程组合会作为「工作组」排在选择列表最前，方便直接套用。
                </p>
                <div className="field-row">
                  <label>工作组保留数量</label>
                  <input
                    type="number"
                    className="focus-number-input"
                    min={3}
                    max={7}
                    step={1}
                    value={settings.maxWorkGroups ?? 3}
                    onChange={(e) => update({
                      maxWorkGroups: Math.max(3, Math.min(7, Math.round(Number(e.target.value) || 3)))
                    })}
                  />
                  <span className="field-hint">3 ~ 7 个，按使用频率排序</span>
                </div>
                <div className="field-row">
                  <label>将本软件列为默认白名单</label>
                  <button
                    className={`switch ${settings.selfWhitelist ? 'on' : ''}`}
                    onClick={() => update({ selfWhitelist: !settings.selfWhitelist })}
                    role="switch"
                    aria-checked={!!settings.selfWhitelist}
                    aria-label="将本软件列为默认白名单"
                  >
                    <span className="switch-knob" />
                  </button>
                </div>
                <p className="settings-desc">
                  开启后，专注期间切到星流本身不算偏离：普通模式暂停加分，严格模式同样暂停但不会倒扣。
                </p>
              </div>

              <div className="settings-section">
                <div className="settings-title-row">
                  <div className="settings-title">特殊白名单</div>
                  <button
                    className="settings-reset-mini"
                    onClick={() => update({
                      specialWhitelist: JSON.parse(JSON.stringify(DEFAULT_SETTINGS.specialWhitelist))
                    })}
                  >
                    恢复默认
                  </button>
                </div>
                <p className="settings-desc">
                  焦点落到这些软件上时不算偏离，积分照常累积，但速度降为下面的设定值。
                  最多选择 5 个进程，也可以把本软件加入白名单。
                </p>

                <div className="field-row">
                  <span className="field-label-group">
                    <label>启用特殊白名单</label>
                    {special.enabled && <span className="field-active">已激活</span>}
                  </span>
                  <button
                    className={`switch ${special.enabled ? 'on' : ''}`}
                    onClick={() => updateSpecial({ enabled: !special.enabled })}
                    role="switch"
                    aria-checked={!!special.enabled}
                    aria-label="启用特殊白名单"
                  >
                    <span className="switch-knob" />
                  </button>
                </div>

                <div className="field-row field-col">
                  <label>白名单进程（最多 5 个）</label>
                  <div className="whitelist-chips">
                    {special.items.length ? special.items.map((item) => {
                      const key = whitelistKey(item);
                      return (
                        <span className="whitelist-chip" key={key}>
                          {item.self ? 'Starry Flow（本软件）' : item.name}
                          <button
                            className="whitelist-chip-remove"
                            onClick={() => removeWhitelistItem(item)}
                            aria-label={`移除 ${item.name}`}
                          >
                            ×
                          </button>
                        </span>
                      );
                    }) : <span className="whitelist-empty">还没有选择进程</span>}
                  </div>
                  <button
                    className="settings-action settings-action-inline whitelist-pick-btn"
                    onClick={() => setWhitelistOpen(true)}
                  >
                    选择进程
                  </button>
                </div>

                <div className="field-row">
                  <label>普通模式积分速度</label>
                  <input
                    type="number"
                    className="focus-number-input"
                    min={1}
                    step={1}
                    value={special.normalSpeed}
                    disabled={!special.enabled}
                    onChange={(e) => updateSpecial({
                      normalSpeed: Math.max(1, Math.round(Number(e.target.value) || 1))
                    })}
                  />
                  <span className="field-hint">积分/秒</span>
                </div>

                <div className="field-row">
                  <label>严格模式积分速度</label>
                  <input
                    type="number"
                    className="focus-number-input"
                    min={1}
                    step={1}
                    value={special.strictSpeed}
                    disabled={!special.enabled}
                    onChange={(e) => updateSpecial({
                      strictSpeed: Math.max(1, Math.round(Number(e.target.value) || 1))
                    })}
                  />
                  <span className="field-hint">积分/秒</span>
                </div>
              </div>

              <div className="settings-section settings-wide">
                <div className="settings-title-row">
                  <div className="settings-title">专注规则</div>
                  <button className="settings-reset-mini" onClick={resetFocusRules}>恢复默认</button>
                </div>
                <p className="settings-desc">
                  基础速度随连续专注时长逐档加速；严格模式改用固定速度，离开专注进程会扣除积分。规则保存后由采集端实时生效。
                </p>

                <div className="rule-inline">
                  <div className="field-row">
                    <label>基础速度</label>
                    <input
                      type="number"
                      className="focus-number-input"
                      min={1}
                      step={1}
                      value={fset.base_points_per_sec}
                      onChange={(e) => updateFocus({ base_points_per_sec: Math.max(1, Number(e.target.value) || 0) })}
                    />
                    <span className="field-hint">积分/秒</span>
                  </div>

                  <div className="field-row">
                    <label>连续加速</label>
                    <button
                      className={`switch ${fset.acceleration_enabled ? 'on' : ''}`}
                      onClick={() => updateFocus({ acceleration_enabled: !fset.acceleration_enabled })}
                    >
                      <span className="switch-knob" />
                    </button>
                  </div>
                </div>

                <div className="settings-caption">连续专注达到以下秒数后，每秒积分提升</div>
                {fset.acceleration_segments.map((seg, i) => (
                  <div className="focus-seg-row" key={i}>
                    <span className="focus-seg-label">第 {i + 1} 档</span>
                    <span className="focus-seg-text">连续</span>
                    <input
                      type="number"
                      className="focus-number-input"
                      min={1}
                      value={seg[0]}
                      onChange={(e) => updateSegment(i, 'end', Math.max(1, Number(e.target.value) || 0))}
                    />
                    <span className="focus-seg-text">秒 →</span>
                    <input
                      type="number"
                      className="focus-number-input"
                      min={1}
                      value={seg[1]}
                      onChange={(e) => updateSegment(i, 'speed', Math.max(1, Number(e.target.value) || 0))}
                    />
                    <span className="focus-seg-text">积分/秒</span>
                  </div>
                ))}

                <div className="settings-caption">严格模式</div>
                <div className="rule-inline">
                  <div className="field-row">
                    <label>启用严格模式</label>
                    <button
                      className={`switch ${strict.enabled ? 'on' : ''}`}
                      onClick={() => updateStrict({ enabled: !strict.enabled })}
                    >
                      <span className="switch-knob" />
                    </button>
                  </div>
                  <div className="field-row">
                    <label>严格模式积分速度</label>
                    <input
                      type="number"
                      className="focus-number-input"
                      min={1}
                      value={strict.points_per_sec}
                      onChange={(e) => updateStrict({ points_per_sec: Math.max(1, Number(e.target.value) || 0) })}
                    />
                    <span className="field-hint">积分/秒</span>
                  </div>
                  <div className="field-row">
                    <label>离开进程扣除积分</label>
                    <input
                      type="number"
                      className="focus-number-input"
                      min={0}
                      value={strict.punish_points}
                      onChange={(e) => updateStrict({ punish_points: Math.max(0, Number(e.target.value) || 0) })}
                    />
                    <span className="field-hint">积分/秒</span>
                  </div>
                  <div className="field-row">
                    <label>结算门槛</label>
                    <input
                      type="number"
                      className="focus-number-input"
                      min={0}
                      step={1000}
                      value={strict.threshold}
                      onChange={(e) => updateStrict({ threshold: Math.max(0, Number(e.target.value) || 0) })}
                    />
                    <span className="field-hint">积分</span>
                  </div>
                </div>
                <p className="settings-desc settings-note">严格模式下，当日积分低于门槛时无法结算。</p>
              </div>

              <div className="settings-section">
                <div className="settings-title">数据调试</div>
                <p className="settings-desc">
                  用于旧数据首次迁移，或因意外导致积分、额度丢失后的补录。输入正数增加、负数减少，操作会立即写入当前总数据。
                </p>

                {!debugUnlocked ? (
                  <button className="settings-action" onClick={() => setConfirmOpen(true)}>
                    开启数据调试
                  </button>
                ) : (
                  <>
                    <div className="debug-row">
                      <span className="debug-label">已结算积分</span>
                      <span className="focus-value-text">{cumulative.toLocaleString()}</span>
                    </div>
                    <div className="debug-row">
                      <input
                        type="number"
                        className="focus-number-input"
                        placeholder="正数增加 / 负数减少"
                        value={pointsDelta}
                        onChange={(e) => setPointsDelta(e.target.value)}
                      />
                      <button
                        className="focus-mini-btn"
                        onClick={() => applyDebug({ points: Number(pointsDelta) || 0 })}
                      >
                        调整积分
                      </button>
                    </div>

                    <div className="debug-row">
                      <span className="debug-label">{allowanceName}</span>
                      <span className="focus-value-text">{allowance}</span>
                    </div>
                    <div className="debug-row">
                      <input
                        type="number"
                        className="focus-number-input"
                        placeholder="正数增加 / 负数减少"
                        value={allowanceDelta}
                        onChange={(e) => setAllowanceDelta(e.target.value)}
                      />
                      <button
                        className="focus-mini-btn"
                        onClick={() => applyDebug({ allowance: Number(allowanceDelta) || 0 })}
                      >
                        调整额度
                      </button>
                    </div>

                    <button
                      className="settings-action settings-action-inline debug-close"
                      onClick={() => {
                        setDebugUnlocked(false);
                        setPointsDelta('');
                        setAllowanceDelta('');
                      }}
                    >
                      收起数据调试
                    </button>
                  </>
                )}
              </div>

            </div>
          )}

          {tab === 'exchange' && (
            <div className="settings-grid">
              <div className="settings-section settings-wide">
                <div className="settings-title-row">
                  <div className="settings-title">兑换与额度</div>
                  <button className="settings-reset-mini" onClick={resetExchange}>恢复默认</button>
                </div>
                <p className="settings-desc">
                  已结算积分可按比例兑换成{allowanceName}，用于给自己发奖励；花费只减少额度，不动积分。
                  未结算的本轮积分需要先「每日结算」才会进入可兑换的积分池。
                </p>

                <div className="exchange-stats">
                  <div className="exchange-stat">
                    <span className="exchange-stat-label">当前可用积分</span>
                    <span className="exchange-stat-value">{cumulative.toLocaleString()}</span>
                    <span className="exchange-stat-hint">已结算、可用于兑换的积分</span>
                  </div>
                  <div className="exchange-stat">
                    <span className="exchange-stat-label">当前可兑换{allowanceName}</span>
                    <span className="exchange-stat-value">{maxExchange.toLocaleString()}</span>
                    <span className="exchange-stat-hint">
                      按 {exchangeRate.toLocaleString()} 积分 / 1 {allowanceName}
                    </span>
                  </div>
                </div>

                <div className="field-row">
                  <label>{allowanceName}名称</label>
                  <input
                    type="text"
                    className="focus-text-input"
                    value={allowanceName}
                    onChange={(e) => updateFocus({ allowance_name: e.target.value })}
                  />
                </div>

                <div className="field-row">
                  <label>兑换比例</label>
                  <input
                    type="number"
                    className="focus-number-input"
                    min={1}
                    step={100}
                    value={fset.exchange_rate}
                    onChange={(e) => updateFocus({ exchange_rate: Math.max(1, Number(e.target.value) || 0) })}
                  />
                  <span className="field-hint">积分 / 1 {allowanceName}</span>
                </div>

                <div className="field-row">
                  <label>当前{allowanceName}</label>
                  <span className="focus-value-text">{allowance.toLocaleString()} {allowanceName}</span>
                </div>

                <div className="field-row">
                  <label>兑换</label>
                  <input
                    type="number"
                    className="focus-number-input"
                    min={1}
                    max={Math.max(1, maxExchange)}
                    value={exchangeAmount}
                    onChange={(e) => setExchangeAmount(Math.max(1, Number(e.target.value) || 1))}
                  />
                  <span className="focus-seg-text">{allowanceName}</span>
                  <button
                    className="focus-mini-btn"
                    onClick={() => onFocusCommand && onFocusCommand('exchange', { amount: exchangeAmount })}
                  >
                    兑换
                  </button>
                </div>

                <div className="field-row">
                  <label>花费</label>
                  <input
                    type="number"
                    className="focus-number-input"
                    min={1}
                    value={spendAmount}
                    onChange={(e) => setSpendAmount(Math.max(1, Number(e.target.value) || 1))}
                  />
                  <span className="focus-seg-text">{allowanceName}</span>
                  <button className="focus-mini-btn" onClick={() => onFocusCommand && onFocusCommand('spend', { amount: spendAmount })}>
                    花费
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'psychology' && (
            <div className="settings-grid">
              <div className="settings-section">
                <div className="settings-title-row">
                  <div className="settings-title">深空契约</div>
                  <button className="settings-reset-mini" onClick={resetSleep}>恢复默认</button>
                </div>
                <p className="settings-desc">
                  在设定的时间段内，专注积分速度降为下面设定的值，提醒你及时休息，不用熬低效率的夜。
                  起止时间各自可选「当日 / 次日」，因此可以跨日，例如「当日 23:00 – 次日 07:00」。
                  在该时段内结算当日积分，还会获得一枚「深空契约履行者」纪念章。
                </p>

                <div className="field-row">
                  <span className="field-label-group">
                    <label>深空契约</label>
                    {sleepCfg.enabled && <span className="field-active">已激活</span>}
                  </span>
                  <button
                    className={`switch ${sleepCfg.enabled ? 'on' : ''}`}
                    onClick={() => updatePsych({ healthySleep: { ...sleepCfg, enabled: !sleepCfg.enabled } })}
                    role="switch"
                    aria-checked={!!sleepCfg.enabled}
                    aria-label="深空契约"
                  >
                    <span className="switch-knob" />
                  </button>
                </div>

                <div className="field-row">
                  <label>开始时间</label>
                  <div className="sleep-time-group">
                    <select
                      className="sleep-day-select"
                      value={sleepCfg.startDay}
                      disabled={!sleepCfg.enabled}
                      onChange={(e) => updatePsych({
                        healthySleep: { ...sleepCfg, startDay: Number(e.target.value) }
                      })}
                      aria-label="契约开始日期"
                    >
                      <option value={0}>当日</option>
                      <option value={1}>次日</option>
                    </select>
                    <input
                      type="time"
                      value={minutesToTimeStr(sleepCfg.startMinutes)}
                      disabled={!sleepCfg.enabled}
                      onChange={(e) => {
                        const minutes = timeStrToMinutes(e.target.value);
                        if (Number.isFinite(minutes)) {
                          updatePsych({ healthySleep: { ...sleepCfg, startMinutes: minutes } });
                        }
                      }}
                      aria-label="契约开始时间"
                    />
                  </div>
                </div>

                <div className="field-row">
                  <label>结束时间</label>
                  <div className="sleep-time-group">
                    <select
                      className="sleep-day-select"
                      value={sleepCfg.endDay}
                      disabled={!sleepCfg.enabled}
                      onChange={(e) => updatePsych({
                        healthySleep: { ...sleepCfg, endDay: Number(e.target.value) }
                      })}
                      aria-label="契约结束日期"
                    >
                      <option value={0}>当日</option>
                      <option value={1}>次日</option>
                    </select>
                    <input
                      type="time"
                      value={minutesToTimeStr(sleepCfg.endMinutes)}
                      disabled={!sleepCfg.enabled}
                      onChange={(e) => {
                        const minutes = timeStrToMinutes(e.target.value);
                        if (Number.isFinite(minutes)) {
                          updatePsych({ healthySleep: { ...sleepCfg, endMinutes: minutes } });
                        }
                      }}
                      aria-label="契约结束时间"
                    />
                  </div>
                </div>

                <div className="field-row">
                  <label>普通模式积分速度</label>
                  <input
                    type="number"
                    className="focus-number-input"
                    min={1}
                    step={1}
                    value={sleepCfg.normalSpeed}
                    disabled={!sleepCfg.enabled}
                    onChange={(e) => updatePsych({
                      healthySleep: { ...sleepCfg, normalSpeed: Math.max(1, Math.round(Number(e.target.value) || 1)) }
                    })}
                  />
                  <span className="field-hint">积分/秒</span>
                </div>

                <div className="field-row">
                  <label>严格模式积分速度</label>
                  <input
                    type="number"
                    className="focus-number-input"
                    min={1}
                    step={1}
                    value={sleepCfg.strictSpeed}
                    disabled={!sleepCfg.enabled}
                    onChange={(e) => updatePsych({
                      healthySleep: { ...sleepCfg, strictSpeed: Math.max(1, Math.round(Number(e.target.value) || 1)) }
                    })}
                  />
                  <span className="field-hint">积分/秒</span>
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-title-row">
                  <div className="settings-title">星辉契约</div>
                  <button className="settings-reset-mini" onClick={resetPact}>恢复默认</button>
                </div>
                <p className="settings-desc">
                  开启后在星图上点击今天或未来日期的星点，为那一天立下积分目标。
                  达成目标会获得额外积分；日期过后仍未达到判定比例，则产生与目标等额的赤字积分，需要从当日累计中偿还。
                </p>

                <div className="field-row">
                  <span className="field-label-group">
                    <label>星辉契约</label>
                    {pactCfg.enabled && <span className="field-active">已激活</span>}
                  </span>
                  <button
                    className={`switch ${pactCfg.enabled ? 'on' : ''}`}
                    onClick={() => updatePsych({ pact: { ...pactCfg, enabled: !pactCfg.enabled } })}
                    role="switch"
                    aria-checked={!!pactCfg.enabled}
                    aria-label="星辉契约"
                  >
                    <span className="switch-knob" />
                  </button>
                </div>

                <div className="field-row">
                  <label>达标判定比例</label>
                  <input
                    type="range"
                    min={50}
                    max={100}
                    step={5}
                    value={pactCfg.ratio}
                    disabled={!pactCfg.enabled}
                    onChange={(e) => updatePsych({ pact: { ...pactCfg, ratio: Number(e.target.value) } })}
                  />
                  <span className="field-value">{pactCfg.ratio}%</span>
                </div>

                <div className="field-row">
                  <label>达成额外奖励</label>
                  <input
                    type="range"
                    min={50}
                    max={150}
                    step={5}
                    value={pactCfg.reward}
                    disabled={!pactCfg.enabled}
                    onChange={(e) => updatePsych({ pact: { ...pactCfg, reward: Number(e.target.value) } })}
                  />
                  <span className="field-value">{pactCfg.reward}%</span>
                </div>

                <p className="settings-desc">
                  例：目标 10,000 积分、奖励 100%，当天达成后实际获得 20,000 积分，并触发一次全屏礼花。
                  未达到 {pactCfg.ratio}% 时，会欠下与目标等额的赤字积分。
                </p>
              </div>
            </div>
          )}

          {tab === 'backup' && (
            <div className="settings-grid">
              <div className="settings-section settings-wide">
                <div className="settings-title">数据存储位置</div>
                <p className="settings-desc">
                  积分、额度与印痕默认存放在系统应用数据目录。可以改到其他磁盘或同步文件夹，更改时会把现有数据复制过去；新位置在重启应用后生效。
                </p>

                {!storageInfo ? (
                  <div className="storage-empty">正在读取路径…</div>
                ) : (
                  <>
                    <div className="storage-list">
                      {[
                        {
                          kind: 'focus',
                          name: `积分与${allowanceName}`,
                          file: 'focus-data.json',
                          value: storageInfo.focusFile,
                          custom: storageInfo.isCustom?.focus
                        },
                        {
                          kind: 'marksText',
                          name: '印痕文字',
                          file: 'marks.json',
                          value: storageInfo.marksFile,
                          custom: storageInfo.isCustom?.marksText
                        },
                        {
                          kind: 'marksImage',
                          name: '印痕图片',
                          file: '图片文件夹',
                          value: storageInfo.marksImageDir,
                          custom: storageInfo.isCustom?.marksImage
                        }
                      ].map((item) => (
                        <div className="storage-row" key={item.kind}>
                          <div className="storage-main">
                            <div className="storage-name">
                              {item.name}
                              <span className="storage-file">{item.file}</span>
                              {item.custom && <span className="storage-tag">自定义</span>}
                            </div>
                            <div className="storage-path" title={item.value}>{item.value}</div>
                          </div>
                          <div className="storage-actions">
                            <button
                              className="settings-action settings-action-inline storage-open"
                              onClick={() => handleOpenStorage(item.kind)}
                            >
                              打开路径
                            </button>
                            <button
                              className="settings-action settings-action-inline"
                              disabled={storageBusy === item.kind}
                              onClick={() => handleChooseStorage(item.kind)}
                            >
                              更改位置
                            </button>
                            {item.custom && (
                              <button
                                className="storage-reset"
                                disabled={storageBusy === item.kind}
                                onClick={() => handleResetStorage(item.kind)}
                              >
                                恢复默认
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {storageInfo.restartRequired && (
                      <div className="storage-restart">
                        <span>存储位置已更改，重启应用后生效。</span>
                        <button className="settings-action settings-action-inline" onClick={onRestartApp}>
                          立即重启
                        </button>
                      </div>
                    )}

                    {storageMsg && (
                      <div className={`backup-msg ${storageMsg.ok ? 'ok' : 'fail'}`}>{storageMsg.text}</div>
                    )}
                  </>
                )}
              </div>

              <div className="settings-section settings-wide">
                <div className="settings-title">备份与恢复</div>
                <p className="settings-desc">
                  备份包含积分与专注数据、星辉契约与赤字、成就、全部设置，以及印痕文字和图片，可在新设备上完整还原。导入会整体替换当前数据。
                </p>
                <div className="backup-buttons">
                  <button className="settings-action" disabled={backupBusy} onClick={handleExport}>
                    导出备份
                  </button>
                  <button className="settings-action" disabled={backupBusy} onClick={handleImport}>
                    导入备份
                  </button>
                </div>
                {backupMsg && (
                  <div className={`backup-msg ${backupMsg.ok ? 'ok' : 'fail'}`}>{backupMsg.text}</div>
                )}
              </div>

              <WebdavPanel onRestored={onWebdavRestored} />
            </div>
          )}
          </div>
        </div>

        <div className="settings-foot">
          <button
            className="settings-action settings-action-inline"
            onClick={() => onChange(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)))}
          >
            恢复默认设置
          </button>
        </div>

        <WhitelistPicker
          open={whitelistOpen}
          processes={(focus && focus.processes) || []}
          items={special.items}
          onSave={(list) => {
            updateSpecial({ items: list });
            setWhitelistOpen(false);
          }}
          onClose={() => setWhitelistOpen(false)}
        />

        {confirmOpen && (
          <div className="confirm-mask" onClick={() => setConfirmOpen(false)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="confirm-title">数据调试</div>
              <p className="confirm-text">
                数据调试功能仅限数据首次迁移或因意外导致的积分丢失的补入，是否继续？
              </p>
              <div className="confirm-actions">
                <button
                  className="settings-action settings-action-inline"
                  onClick={() => setConfirmOpen(false)}
                >
                  取消
                </button>
                <button
                  className="confirm-ok"
                  onClick={() => {
                    setConfirmOpen(false);
                    setDebugUnlocked(true);
                  }}
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
