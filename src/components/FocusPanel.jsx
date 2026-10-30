import React, { useMemo, useState, useEffect, useRef } from 'react';
import { tierIndex, nextTier, tierBrightness, tierGlow, tierHex, seededRandom } from '../lib/logic';

const STATUS_TEXT = {
  focusing: '专注中',
  paused: '已暂停',
  idle: '空闲'
};

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

export default function FocusPanel({ focus, todayPoints, tiers, starColor, notice, connected, onCommand }) {
  const [noticeClosed, setNoticeClosed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(null);
  const [iconMap, setIconMap] = useState({});
  const iconMapRef = useRef({});
  const iconPending = useRef(new Set());

  useEffect(() => {
    setNoticeClosed(false);
  }, [notice?.id]);

  const settings = focus?.settings || null;
  const strict = settings?.strict || null;
  const processes = focus?.processes || [];
  const selectedPid = focus?.selected_pid || null;
  const running = !!focus?.running;
  const focusLost = !!focus?.focus_lost;

  const status = running ? 'focusing' : (focus?.status || 'idle');

  const level = tierIndex(todayPoints, tiers);
  const tier = level >= 0 ? tiers[level] : null;
  const next = nextTier(todayPoints, tiers);
  const lastTierPoints = Math.max(1, tiers[tiers.length - 1].points);

  const cumulative = focus?.cumulative_points || 0;
  const allowance = focus?.allowance || 0;
  const allowanceName = settings?.allowance_name || '随心额度';

  const speed = strict?.enabled
    ? strict.points_per_sec
    : (running && focus?.current_speed ? focus.current_speed : settings?.base_points_per_sec || 3);

  const selectedProcess = processes.find((p) => p.pid === selectedPid) || null;
  const currentName = focus?.selected_name || (picked?.pid === selectedPid ? picked.name : '');
  const currentPath = selectedProcess?.path || focus?.selected_path || (picked?.pid === selectedPid ? picked.path : '');
  const currentIcon = currentPath ? iconMap[currentPath] : null;

  // 按需取进程图标：信息模块只需当前进程，弹窗打开时补齐整个列表
  useEffect(() => {
    const api = window.api;
    if (!api || !api.getProcessIcon) return;
    const wanted = pickerOpen
      ? processes.map((p) => p.path)
      : [currentPath];
    for (const p of wanted) {
      if (!p || iconPending.current.has(p) || p in iconMapRef.current) continue;
      iconPending.current.add(p);
      api.getProcessIcon(p).then((url) => {
        iconMapRef.current[p] = url || null;
        setIconMap({ ...iconMapRef.current });
      });
    }
  }, [pickerOpen, processes, currentPath]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? processes.filter((p) => `${p.name} ${p.title}`.toLowerCase().includes(q))
      : processes;
    const items = filtered.map((p) => ({ pid: p.pid, name: p.name, title: p.title, path: p.path || '' }));
    if (selectedPid && !q && !items.some((item) => item.pid === selectedPid)) {
      items.unshift({
        pid: selectedPid,
        name: currentName || `PID ${selectedPid}`,
        title: '已退出',
        path: currentPath || ''
      });
    }
    return items;
  }, [processes, query, selectedPid, currentName, currentPath]);

  const openPicker = () => {
    setPickerOpen(true);
    if (connected) onCommand('refresh_processes');
  };

  const closePicker = () => {
    setPickerOpen(false);
    setQuery('');
  };

  const choose = (p) => {
    setPicked({ pid: p.pid, name: p.name, path: p.path });
    onCommand('select', { pid: p.pid, name: p.name, path: p.path });
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

  return (
    <div className="focus-panel card">
      {notice && !noticeClosed && (
        <div className={`notice-bar ${notice.ok ? 'ok' : 'fail'}`}>
          <span>{notice.message}</span>
          <button className="notice-close" onClick={() => setNoticeClosed(true)}>×</button>
        </div>
      )}

      <div className="focus-head">
        <div className="focus-app">
          <span className="focus-app-icon">
            <ProcessIcon name={currentName} icon={currentIcon} />
          </span>
          <span className="focus-app-text">
            <span className="focus-app-name">
              {connected ? (currentName || '尚未选择进程') : '采集端未连接'}
            </span>
            <span className="focus-app-sub">
              {connected
                ? (currentName
                  ? `PID ${selectedPid} · ${STATUS_TEXT[status] || status}`
                  : '选择一个应用作为专注目标')
                : '专注数据暂不可用'}
            </span>
          </span>
          <button className="focus-pick-btn" disabled={!connected} onClick={openPicker}>
            {currentName ? '更换进程' : '选择进程'}
          </button>
        </div>

        <div className="focus-strict">
          <span className="focus-strict-label">严格模式</span>
          <button
            className={`switch ${strict?.enabled ? 'on' : ''}`}
            disabled={!connected || !strict}
            onClick={toggleStrict}
          >
            <span className="switch-knob" />
          </button>
          <span className="focus-strict-hint">
            {strict?.enabled ? `离开扣 ${strict.punish_points} 分` : '离开不扣分'}
          </span>
        </div>
      </div>

      <div className="focus-score">
        <div className="focus-label-row">
          <span>当前积分</span>
          <span className={`live-dot ${running ? 'on' : ''}`} />
          <span className="live-text">{STATUS_TEXT[status] || status}</span>
        </div>
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
        <div className="focus-sub">
          {level >= 0
            ? `已达成 L${level + 1}`
            : `距 L1 还差 ${(tiers[0].points - todayPoints).toLocaleString()} 分`}
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
              ? `再得 ${(next.points - todayPoints).toLocaleString()} 分升至 L${tiers.indexOf(next) + 1}`
              : `已达 L${tiers.length}，保持状态！`}
          </div>
        </div>
        <div className="focus-meta">
          <span>累计 {cumulative.toLocaleString()} 分</span>
          <span className="focus-dot">·</span>
          <span>当前速度 {speed} 分/秒</span>
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
      </div>

      <div className="focus-foot">
        <div className="focus-allowance">
          <span className="focus-allowance-label">{allowanceName}</span>
          <span className="focus-allowance-value">{allowance}</span>
        </div>
        <div className="focus-buttons">
          <button
            className={`focus-main-btn${!running && status !== 'paused' ? ' solid' : ''}`}
            disabled={!connected || (!selectedPid && !running)}
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

      {pickerOpen && (
        <div className="picker-mask" onClick={closePicker}>
          <div className="picker-window" onClick={(e) => e.stopPropagation()}>
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
            <div className="picker-list">
              {options.map((p) => (
                <button
                  key={p.pid}
                  className={`picker-item ${p.pid === selectedPid ? 'on' : ''}`}
                  onClick={() => choose(p)}
                >
                  <span className="picker-item-icon">
                    <ProcessIcon name={p.name} icon={p.path ? iconMap[p.path] : null} />
                  </span>
                  <span className="picker-item-main">
                    <span className="picker-item-name">{p.name}</span>
                    <span className="picker-item-title">{p.title}</span>
                  </span>
                  <span className="picker-item-pid">PID {p.pid}</span>
                </button>
              ))}
              {!options.length && <div className="picker-empty">没有匹配的进程</div>}
            </div>
            <div className="picker-foot">
              只列出有可见窗口的程序，共 {processes.length} 个
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
