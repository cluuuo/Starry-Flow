import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { tierIndex, nextTier, tierBrightness, tierGlow, tierHex, seededRandom } from '../lib/logic';
import { starMotionStyle } from './StarField';
import SkyBackdrop from './SkyBackdrop';
import MeteorLayer from './MeteorLayer';

const STATUS_TEXT = {
  focusing: '专注中',
  paused: '已暂停',
  idle: '空闲'
};

// 极简模式圆环中心的大号星点，与星图共用同一轮廓
const STAR4_PATH =
  'M50 7 C54 30 65 41 93 50 C65 59 54 70 50 93 C46 70 35 59 7 50 C35 41 46 30 50 7 Z';

// 没有取到图标时，用进程名首字母兜底
function ProcessIcon({ name, icon }) {
  if (icon) return <img src={icon} alt="" draggable={false} />;
  const letter = (name || '?').replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || '?';
  return <span className="process-letter">{letter}</span>;
}

// 严格模式下，数字背后自右向左划过的流星
function StrictMeteors() {
  const meteors = useMemo(() => {
    const rnd = seededRandom('strict-meteor');
    return Array.from({ length: 7 }, (_, i) => ({
      id: i,
      top: 6 + rnd() * 78,
      duration: 0.9 + rnd() * 0.7,
      delay: -rnd() * 4,
      tail: 42 + rnd() * 46
    }));
  }, []);
  return (
    <div className="meteor-strip" aria-hidden="true">
      {meteors.map((m) => (
        <span
          key={m.id}
          className="meteor-shot"
          style={{
            top: `${m.top}%`,
            animationDuration: `${m.duration}s`,
            animationDelay: `${m.delay}s`
          }}
        >
          <span className="meteor-shot-head" />
          <span className="meteor-shot-tail" style={{ width: `${m.tail}px` }} />
        </span>
      ))}
    </div>
  );
}

export default function FocusPanel({
  focus,
  todayPoints,
  todayTotal,
  tiers,
  starColor,
  connected,
  onCommand,
  motion,
  sky,
  processHistory,
  maxWorkGroups = 3,
  onPickProcesses,
  deficit = 0,
  onPayDeficit,
  sleepActive = false,
  specialActive = false,
  variant = 'classic'
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pickedPids, setPickedPids] = useState([]);
  const [iconMap, setIconMap] = useState({});
  const iconMapRef = useRef({});
  const iconPending = useRef(new Set());

  const settings = focus?.settings || null;
  const strict = settings?.strict || null;
  const processes = focus?.processes || [];
  const running = !!focus?.running;
  const focusLost = !!focus?.focus_lost;
  const whitelistPaused = !!focus?.whitelist_paused;

  // 兼容旧数据：selected_pids 为空时回落到单进程字段
  const selectedList = useMemo(() => {
    const list = Array.isArray(focus?.selected_pids) ? focus.selected_pids : [];
    if (list.length) return list.slice(0, 2);
    if (focus?.selected_pid) {
      return [{ pid: focus.selected_pid, name: focus.selected_name || '', path: focus.selected_path || '' }];
    }
    return [];
  }, [focus?.selected_pids, focus?.selected_pid, focus?.selected_name, focus?.selected_path]);

  const status = running ? 'focusing' : (focus?.status || 'idle');

  const level = tierIndex(todayPoints, tiers);
  const tier = level >= 0 ? tiers[level] : null;
  const next = nextTier(todayPoints, tiers);
  const lastTierPoints = Math.max(1, tiers[tiers.length - 1].points);

  const allowance = focus?.allowance || 0;
  const allowanceName = settings?.allowance_name || '随心额度';

  const speed = strict?.enabled
    ? strict.points_per_sec
    : (running && focus?.current_speed ? focus.current_speed : settings?.base_points_per_sec || 3);

  const selectedName = selectedList.map((p) => p.name).filter(Boolean).join(' + ');
  const selectedPaths = selectedList.map((p) => p.path).filter(Boolean);
  const selectedIconKey = selectedPaths.join('|');

  // 按需取进程图标：信息模块只需当前选中的进程，弹窗打开时补齐整个列表
  useEffect(() => {
    const api = window.api;
    if (!api || !api.getProcessIcon) return;
    const wanted = pickerOpen
      ? processes.map((p) => p.path)
      : selectedPaths;
    for (const p of wanted) {
      if (!p || iconPending.current.has(p) || p in iconMapRef.current) continue;
      iconPending.current.add(p);
      api.getProcessIcon(p).then((url) => {
        iconMapRef.current[p] = url || null;
        setIconMap({ ...iconMapRef.current });
      });
    }
  }, [pickerOpen, processes, selectedIconKey]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? processes.filter((p) => `${p.name} ${p.title}`.toLowerCase().includes(q))
      : processes;
    const items = filtered.map((p) => ({ pid: p.pid, name: p.name, title: p.title, path: p.path || '' }));
    if (!q) {
      // 已选中但已退出的进程补在最前，仍可取消勾选
      selectedList.forEach((p) => {
        if (!items.some((item) => item.pid === p.pid)) {
          items.unshift({ pid: p.pid, name: p.name || `PID ${p.pid}`, title: '已退出', path: p.path || '' });
        }
      });
    }
    return items;
  }, [processes, query, selectedList]);

  // 历史记录以可执行路径为键，路径缺失时退回进程名
  const matchKey = (p) => (p.path ? p.path : `name:${p.name}`);

  const workGroups = useMemo(() => {
    const groups = (processHistory && processHistory.groups) || [];
    return groups.slice(0, Math.max(3, Math.min(7, Number(maxWorkGroups) || 3)));
  }, [processHistory, maxWorkGroups]);

  const frequentSingles = useMemo(() => {
    const singles = (processHistory && processHistory.singles) || [];
    return singles.slice(0, 5);
  }, [processHistory]);

  const openPicker = () => {
    setPickerOpen(true);
    setPickedPids(selectedList.map((p) => p.pid));
    if (connected) onCommand('refresh_processes');
  };

  const closePicker = () => {
    setPickerOpen(false);
    setQuery('');
  };

  // 勾选：最多两个，超出时挤掉最早勾选的那个
  const togglePick = (p) => {
    setPickedPids((prev) => {
      if (prev.includes(p.pid)) return prev.filter((id) => id !== p.pid);
      if (prev.length >= 2) return [...prev.slice(1), p.pid];
      return [...prev, p.pid];
    });
  };

  const applyPicks = () => {
    const list = pickedPids
      .map((pid) => options.find((p) => p.pid === pid) || processes.find((p) => p.pid === pid))
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => ({ pid: p.pid, name: p.name, path: p.path || '' }));
    if (!list.length || !onPickProcesses) return;
    onPickProcesses(list);
    closePicker();
  };

  // 工作组 / 常用项：按路径匹配当前进程后直接应用，省去逐个勾选
  const applyGroup = (group) => {
    const list = group.paths
      .map((key) => processes.find((p) => matchKey(p) === key))
      .filter(Boolean)
      .map((p) => ({ pid: p.pid, name: p.name, path: p.path || '' }));
    if (!list.length || !onPickProcesses) return;
    onPickProcesses(list);
    closePicker();
  };

  const applySingle = (single) => {
    const p = processes.find((proc) => matchKey(proc) === single.path);
    if (!p || !onPickProcesses) return;
    onPickProcesses([{ pid: p.pid, name: p.name, path: p.path || '' }]);
    closePicker();
  };

  const toggleRun = () => {
    if (running) onCommand('pause');
    else onCommand('start');
  };

  const toggleStrict = () => {
    if (!strict) return;
    onCommand('set_strict', { enabled: !strict.enabled });
  };

  const pickerModal = pickerOpen && (
    <div className="picker-mask" onClick={closePicker}>
      <div className="picker-window picker-window-group" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <span>选择专注进程</span>
          <button className="picker-close" onClick={closePicker}>×</button>
        </div>
        <div className="picker-search-row">
          <input
            className="picker-search"
            autoFocus
            placeholder="搜索进程名称或窗口标题"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="picker-refresh" onClick={() => onCommand('refresh_processes')}>
            刷新
          </button>
        </div>

        <div className="picker-body">
          {workGroups.length > 0 && (
            <div className="picker-section">
              <div className="picker-section-title">工作组</div>
              {workGroups.map((g) => {
                const usable = g.paths.some((key) => processes.some((p) => matchKey(p) === key));
                return (
                  <button
                    key={g.paths.join('|')}
                    className="group-item"
                    disabled={!usable}
                    onClick={() => applyGroup(g)}
                  >
                    <span className="group-icons">
                      {g.paths.map((key) => {
                        const p = processes.find((proc) => matchKey(proc) === key);
                        const idx = g.paths.indexOf(key);
                        return (
                          <span className="group-icon" key={key}>
                            <ProcessIcon
                              name={(p && p.name) || (g.names && g.names[idx]) || ''}
                              icon={p && p.path ? iconMap[p.path] : null}
                            />
                          </span>
                        );
                      })}
                    </span>
                    <span className="group-names">
                      {g.paths.map((key, idx) => {
                        const p = processes.find((proc) => matchKey(proc) === key);
                        return (p && p.name) || (g.names && g.names[idx]) || '已退出';
                      }).join(' + ')}
                    </span>
                    <span className="group-count">用过 {g.count} 次</span>
                  </button>
                );
              })}
            </div>
          )}

          {frequentSingles.length > 0 && (
            <div className="picker-section">
              <div className="picker-section-title">常用</div>
              <div className="frequent-row">
                {frequentSingles.map((s) => {
                  const p = processes.find((proc) => matchKey(proc) === s.path);
                  return (
                    <button
                      key={s.path}
                      className="frequent-item"
                      disabled={!p}
                      onClick={() => applySingle(s)}
                    >
                      <span className="frequent-icon">
                        <ProcessIcon name={p ? p.name : s.name} icon={p && p.path ? iconMap[p.path] : null} />
                      </span>
                      <span className="frequent-name">{p ? p.name : s.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="picker-section">
            <div className="picker-section-title">全部进程</div>
            <div className="picker-list picker-list-group">
              {options.map((p) => {
                const checked = pickedPids.includes(p.pid);
                return (
                  <button
                    key={p.pid}
                    className={`picker-item ${checked ? 'on' : ''}`}
                    onClick={() => togglePick(p)}
                  >
                    <span className={`pick-box ${checked ? 'on' : ''}`}>{checked ? '✓' : ''}</span>
                    <span className="picker-item-icon">
                      <ProcessIcon name={p.name} icon={p.path ? iconMap[p.path] : null} />
                    </span>
                    <span className="picker-item-main">
                      <span className="picker-item-name">{p.name}</span>
                      <span className="picker-item-title">{p.title}</span>
                    </span>
                    <span className="picker-item-pid">{p.title === '已退出' ? '已退出' : `PID ${p.pid}`}</span>
                  </button>
                );
              })}
              {!options.length && <div className="picker-empty">没有匹配的进程</div>}
            </div>
          </div>
        </div>

        <div className="picker-foot picker-foot-group">
          <span className="picker-hint">已选 {pickedPids.length} / 2 · 最多同时监控两个进程</span>
          <div className="picker-actions">
            <button className="picker-cancel" onClick={closePicker}>取消</button>
            <button className="picker-apply" disabled={!pickedPids.length} onClick={applyPicks}>
              应用选择
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // 用 portal 挂到 body：极简面板的 position:relative 会把 fixed 遮罩拖进面板内部
  const pickerOverlay = pickerModal ? createPortal(pickerModal, document.body) : null;

  // 极简模式：圆环进度包裹星点与积分，只保留操作必需信息
  if (variant === 'compact') {
    const progress = Math.max(0, Math.min(1, todayPoints / lastTierPoints));
    const radius = 92;
    const circumference = 2 * Math.PI * radius;
    const litColor = level >= 0 ? tierHex(starColor, level, tier) : starColor;
    const ringColor = focusLost ? '#ff5f57' : litColor;

    return (
      <div className="focus-panel focus-panel-compact card">
        <SkyBackdrop
          density={sky?.density ?? 1}
          duration={sky?.duration ?? 90}
          animated={sky?.animated !== false}
        />
        <MeteorLayer enabled={sky?.animated !== false} />

        <div className="compact-head">
          <span className={`focus-app-icon${selectedList.length > 1 ? ' multi' : ''}`}>
            {selectedList.length ? (
              selectedList.map((p, i) => (
                <span className="focus-app-icon-slot" key={`${p.pid}-${i}`}>
                  <ProcessIcon name={p.name} icon={p.path ? iconMap[p.path] : null} />
                </span>
              ))
            ) : (
              <ProcessIcon name="" icon={null} />
            )}
          </span>
          <span className="focus-app-text">
            <span className="focus-app-name">
              {connected ? (selectedName || '尚未选择进程') : '采集端未连接'}
            </span>
            <span className="focus-app-sub">
              {connected
                ? (selectedList.length
                  ? (whitelistPaused
                    ? '已切换到星流，计时暂停'
                    : `${selectedList.length > 1 ? `${selectedList.length} 个进程` : `PID ${selectedList[0].pid}`} · ${STATUS_TEXT[status] || status}`)
                  : '选择一个应用作为专注目标')
                : '专注数据暂不可用'}
            </span>
          </span>
          <button className="focus-pick-btn" disabled={!connected} onClick={openPicker}>
            {selectedList.length ? '更换进程' : '选择进程'}
          </button>
        </div>

        <div className="compact-strict">
          <span className="focus-strict-label">严格模式</span>
          <span className="focus-strict-hint">
            {strict?.enabled ? '离开进程会持续扣除积分' : '离开进程不会扣除积分'}
          </span>
          <button
            className={`switch ${strict?.enabled ? 'on' : ''}`}
            disabled={!connected || !strict}
            role="switch"
            aria-checked={!!strict?.enabled}
            aria-label="严格模式"
            onClick={toggleStrict}
          >
            <span className="switch-knob" />
          </button>
        </div>

        <div className="compact-ring">
          <svg viewBox="0 0 200 200" className="compact-ring-svg" aria-hidden="true">
            <circle cx="100" cy="100" r={radius} className="compact-ring-track" />
            <circle
              cx="100"
              cy="100"
              r={radius}
              className="compact-ring-glow"
              style={{
                stroke: ringColor,
                strokeDasharray: circumference.toFixed(2),
                strokeDashoffset: (circumference * (1 - progress)).toFixed(2)
              }}
              transform="rotate(-90 100 100)"
            />
            <circle
              cx="100"
              cy="100"
              r={radius}
              className="compact-ring-fill"
              style={{
                stroke: ringColor,
                strokeDasharray: circumference.toFixed(2),
                strokeDashoffset: (circumference * (1 - progress)).toFixed(2)
              }}
              transform="rotate(-90 100 100)"
            />
          </svg>
          <div className="compact-ring-center">
            <svg
              className="compact-star"
              viewBox="0 0 100 100"
              style={{
                ...starMotionStyle('compact-star', motion),
                color: litColor,
                filter: level >= 0
                  ? `brightness(${tierBrightness(tier, level).toFixed(2)}) drop-shadow(0 0 ${(6 + tierGlow(tier, level) * 10).toFixed(1)}px ${litColor})`
                  : 'none'
              }}
            >
              <path d={STAR4_PATH} fill="currentColor" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" />
            </svg>
            <div
              className={`compact-points${focusLost ? ' lost' : ''}`}
              style={!focusLost
                ? {
                  color: litColor,
                  filter: `brightness(${level >= 0 ? tierBrightness(tier, level).toFixed(2) : 0.9})`
                }
                : undefined}
            >
              {todayPoints.toLocaleString()}
            </div>
          </div>
        </div>

        {strict?.enabled && (
          <div className="compact-meta">结算门槛 {strict.threshold.toLocaleString()}</div>
        )}
        {focus?.penalty_active && (
          <div className="focus-warn">{focus?.warn_message || '已离开专注进程，积分正在扣除'}</div>
        )}
        {whitelistPaused && !focusLost && (
          <div className="focus-warn whitelist">已切换到星流，计时暂停</div>
        )}

        <div className="compact-buttons">
          <button
            className={`focus-main-btn${!running && status !== 'paused' ? ' solid' : ''}`}
            disabled={!connected || (!selectedList.length && !running)}
            onClick={toggleRun}
          >
            {running ? '暂停计时' : status === 'paused' ? '继续专注' : '开始专注'}
          </button>
          <button
            className="focus-sub-btn"
            disabled={!connected}
            onClick={() => onCommand('settle')}
          >
            每日结算
          </button>
        </div>

        {pickerOverlay}
      </div>
    );
  }

  return (
    <div className="focus-panel card">
      <div className="focus-head">
        <div className="focus-app">
          <span className={`focus-app-icon${selectedList.length > 1 ? ' multi' : ''}`}>
            {selectedList.length ? (
              selectedList.map((p, i) => (
                <span className="focus-app-icon-slot" key={`${p.pid}-${i}`}>
                  <ProcessIcon name={p.name} icon={p.path ? iconMap[p.path] : null} />
                </span>
              ))
            ) : (
              <ProcessIcon name="" icon={null} />
            )}
          </span>
          <span className="focus-app-text">
            <span className="focus-app-name">
              {connected ? (selectedName || '尚未选择进程') : '采集端未连接'}
            </span>
            <span className="focus-app-sub">
              {connected
                ? (selectedList.length
                  ? (whitelistPaused
                    ? '已切换到星流，计时暂停'
                    : `${selectedList.length > 1 ? `${selectedList.length} 个进程` : `PID ${selectedList[0].pid}`} · ${STATUS_TEXT[status] || status}`)
                  : '选择一个应用作为专注目标')
                : '专注数据暂不可用'}
            </span>
          </span>
          <button className="focus-pick-btn" disabled={!connected} onClick={openPicker}>
            {selectedList.length ? '更换进程' : '选择进程'}
          </button>
        </div>

        <div className="focus-strict">
          <span className="focus-strict-label">严格模式</span>
          <span className="focus-strict-hint">
            {strict?.enabled ? '离开进程会持续扣除积分' : '离开进程不会扣除积分'}
          </span>
          <button
            className={`switch ${strict?.enabled ? 'on' : ''}`}
            disabled={!connected || !strict}
            role="switch"
            aria-checked={!!strict?.enabled}
            aria-label="严格模式"
            onClick={toggleStrict}
          >
            <span className="switch-knob" />
          </button>
        </div>
      </div>

      <div className="focus-score">
        <div className="focus-label-row">
          <span>当前积分</span>
          <span className={`live-dot ${running ? 'on' : ''}`} />
          <span className="live-text">{STATUS_TEXT[status] || status}</span>
        </div>
        <div className="focus-value-row">
          <div className="focus-number-wrap">
            {strict?.enabled && !focusLost && <StrictMeteors />}
            <div
              className={`focus-number${focusLost ? ' lost' : ''}`}
              style={!focusLost && level >= 0
                ? { color: tierHex(starColor, level, tier), filter: `brightness(${tierBrightness(tier, level)})` }
                : {}}
            >
              {todayPoints.toLocaleString()}
            </div>
          </div>
          {deficit > 0 && (
            <button
              type="button"
              className="focus-deficit"
              onClick={onPayDeficit}
              title="点击平账"
            >
              -{deficit.toLocaleString()}
            </button>
          )}
        </div>
        <div className="focus-sub">
          {level >= 0
            ? `已达成 L${level + 1}`
            : `距 L1 还差 ${(tiers[0].points - todayPoints).toLocaleString()} 积分`}
        </div>
        <div className="focus-progress">
          <div className="progress-track">
            {tiers.map((t, i) => {
              const prev = i === 0 ? 0 : tiers[i - 1].points;
              const left = (prev / lastTierPoints) * 100;
              const width = ((t.points - prev) / lastTierPoints) * 100;
              const fill = Math.max(0, Math.min(1, (todayPoints - prev) / (t.points - prev)));
              return (
                <div key={i} className="progress-seg" style={{ left: `${left}%`, width: `${width}%` }}>
                  <div
                    className="progress-seg-fill"
                    style={{
                      width: `${fill * 100}%`,
                      backgroundColor: tierHex(starColor, i, t),
                      filter: `brightness(${tierBrightness(t, i)})`
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="progress-marks">
            {tiers.map((t, i) => (
              <div
                key={i}
                className="progress-mark"
                style={{ left: `${Math.min(100, (t.points / lastTierPoints) * 100)}%` }}
              >
                <span
                  className="mark-dot"
                  style={{
                    backgroundColor: todayPoints >= t.points ? tierHex(starColor, i, t) : 'var(--cell-empty)',
                    filter: todayPoints >= t.points ? `brightness(${tierBrightness(t, i)})` : 'none',
                    boxShadow: todayPoints >= t.points ? `0 0 ${(4 + tierGlow(t, i) * 6).toFixed(1)}px ${tierHex(starColor, i, t)}` : 'none'
                  }}
                />
                <span className="mark-label">{t.points.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="focus-hint">
            {next
              ? `再得 ${(next.points - todayPoints).toLocaleString()} 积分升至 L${tiers.indexOf(next) + 1}`
              : `已达 L${tiers.length}，保持状态！`}
          </div>
        </div>
        <div className="focus-meta">
          <span>当前速度 {speed} 积分/秒</span>
          {sleepActive && <span className="focus-sleep-tag">就寝时段</span>}
          {specialActive && <span className="focus-special-tag">特殊白名单</span>}
          {strict?.enabled && (
            <>
              <span className="focus-dot">·</span>
              <span>结算门槛 {strict.threshold.toLocaleString()}</span>
            </>
          )}
        </div>
        {focus?.penalty_active && (
          <div className="focus-warn">{focus?.warn_message || '已离开专注进程，积分正在扣除'}</div>
        )}
        {whitelistPaused && !focusLost && (
          <div className="focus-warn whitelist">已切换到星流，计时暂停</div>
        )}
      </div>

      <div className="focus-foot">
        <div className="focus-foot-left">
          <div className="focus-allowance focus-today">
            <span className="focus-allowance-label">本日累计</span>
            <span className="focus-allowance-value">
              {(todayTotal ?? todayPoints).toLocaleString()}
            </span>
            <span className="focus-today-unit">积分</span>
          </div>
          <div className="focus-allowance">
            <span className="focus-allowance-label">{allowanceName}</span>
            <span className="focus-allowance-value">{allowance}</span>
          </div>
        </div>
        <div className="focus-buttons">
          <button
            className={`focus-main-btn${!running && status !== 'paused' ? ' solid' : ''}`}
            disabled={!connected || (!selectedList.length && !running)}
            onClick={toggleRun}
          >
            {running ? '暂停计时' : status === 'paused' ? '继续专注' : '开始专注'}
          </button>
          <button
            className="focus-sub-btn"
            disabled={!connected}
            onClick={() => onCommand('settle')}
          >
            每日结算
          </button>
        </div>
      </div>

      {pickerModal}
    </div>
  );
}
