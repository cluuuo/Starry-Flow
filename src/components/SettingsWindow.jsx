import React, { useState } from 'react';
import { minutesToTimeStr, timeStrToMinutes, DEFAULT_SETTINGS, tierBrightness, tierGlow, tierHex, hsvToHex } from '../lib/logic';

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
  onRestart,
  startDateKey,
  focus,
  onFocusCommand,
  onBackupExport,
  onBackupImport
}) {
  const [tab, setTab] = useState(() => (settings.settingsTab === 'rules' ? 'rules' : 'appearance'));
  const [exchangeAmount, setExchangeAmount] = useState(1);
  const [spendAmount, setSpendAmount] = useState(1);
  const [backupMsg, setBackupMsg] = useState(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [debugUnlocked, setDebugUnlocked] = useState(false);
  const [pointsDelta, setPointsDelta] = useState('');
  const [allowanceDelta, setAllowanceDelta] = useState('');

  if (!open) return null;

  const update = (patch) => onChange({ ...settings, ...patch });

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

  // 数据调试：直接增减累计积分与额度，正负皆可
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
      ? { ok: true, text: `已导入 ${res.summary?.days || 0} 天记录，累计 ${res.summary?.cumulative ?? 0} 分。` }
      : { ok: false, text: res?.error || '导入失败' });
  };

  const updateTier = (i, patch) => {
    const tiers = settings.tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t));
    update({ tiers });
  };

  const updateMotion = (patch) => update({ starMotion: { ...settings.starMotion, ...patch } });
  const updateSky = (patch) => update({ sky: { ...settings.sky, ...patch } });

  return (
    <div className="settings-mask" onClick={onClose}>
      <div className="settings-window" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span>设置</span>
          <button className="settings-close" onClick={onClose}>×</button>
        </div>

        <div className="settings-tabs">
          <button
            className={`settings-tab ${tab === 'appearance' ? 'on' : ''}`}
            onClick={() => {
              setTab('appearance');
              update({ settingsTab: 'appearance' });
            }}
          >
            外观设置
          </button>
          <button
            className={`settings-tab ${tab === 'rules' ? 'on' : ''}`}
            onClick={() => {
              setTab('rules');
              update({ settingsTab: 'rules' });
            }}
          >
            规则设置
          </button>
        </div>

        <div className="settings-body">
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
                <p className="settings-desc">星点是每日贡献的化身，形状与颜色都可按喜好调整。</p>

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
                  <label>启用漂浮</label>
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
                  <div className="settings-title">夜空</div>
                  <button className="settings-reset-mini" onClick={() => resetKeys(['sky'])}>恢复默认</button>
                </div>
                <p className="settings-desc">
                  背景星野缓慢流动，流星偶尔划过。默认今日积分越高，流动越快；关闭动态后星空静止，星星仍然显示。
                </p>

                <div className="field-row">
                  <label>星空动态</label>
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
                  <div className="settings-title">贡献档位</div>
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
                        <span className="tier-unit">分</span>
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
                  例：默认 07:00 开始、次日 04:00 封存，则今晚 20:00 熬夜到 01:00 的贡献都计入今天。
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
                  <div className="settings-title">兑换与额度</div>
                  <button className="settings-reset-mini" onClick={resetExchange}>恢复默认</button>
                </div>
                <p className="settings-desc">
                  累计积分可按比例兑换成{allowanceName}，用于给自己发奖励；花费只减少额度，不动积分。
                </p>

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
                  <span className="field-hint">分 / 1 {allowanceName}</span>
                </div>

                <div className="field-row">
                  <label>当前额度</label>
                  <span className="focus-value-text">{allowance} {allowanceName}</span>
                </div>

                <div className="field-row">
                  <label>兑换</label>
                  <input
                    type="number"
                    className="focus-number-input"
                    min={1}
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

              <div className="settings-section settings-wide">
                <div className="settings-title-row">
                  <div className="settings-title">专注规则</div>
                  <button className="settings-reset-mini" onClick={resetFocusRules}>恢复默认</button>
                </div>
                <p className="settings-desc">
                  基础速度随连续专注时长逐档加速；严格模式改用固定速度，离开专注进程会扣分。规则保存后由采集端实时生效。
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
                    <span className="field-hint">分 / 秒</span>
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
                    <span className="focus-seg-text">分 / 秒</span>
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
                    <label>严格模式速度</label>
                    <input
                      type="number"
                      className="focus-number-input"
                      min={1}
                      value={strict.points_per_sec}
                      onChange={(e) => updateStrict({ points_per_sec: Math.max(1, Number(e.target.value) || 0) })}
                    />
                    <span className="field-hint">分 / 秒</span>
                  </div>
                  <div className="field-row">
                    <label>离开进程扣分</label>
                    <input
                      type="number"
                      className="focus-number-input"
                      min={0}
                      value={strict.punish_points}
                      onChange={(e) => updateStrict({ punish_points: Math.max(0, Number(e.target.value) || 0) })}
                    />
                    <span className="field-hint">分 / 次</span>
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
                    <span className="field-hint">分</span>
                  </div>
                </div>
                <p className="settings-desc settings-note">严格模式下，当日积分低于门槛时无法结算。</p>
              </div>

              <div className="settings-section">
                <div className="settings-title">备份与恢复</div>
                <p className="settings-desc">
                  备份包含专注数据、积分历史、规则与界面设置。导入会整体替换，印痕图片不包含在备份内。
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
                      <span className="debug-label">累计积分</span>
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

              <div className="settings-section">
                <div className="settings-title">新的旅程</div>
                <p className="settings-desc">
                  起始日：{startDateKey || '今天'}。重新开始会把起始日设为今天，星图回到最初的两颗星。
                </p>
                <button className="settings-action" onClick={onRestart}>
                  从今天重新开始
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="settings-foot">
          <button
            className="settings-action settings-action-inline"
            onClick={() => onChange(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)))}
          >
            恢复默认设置
          </button>
        </div>

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
