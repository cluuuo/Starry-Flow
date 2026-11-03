import React, { useEffect, useMemo, useRef, useState } from 'react';
import ContextMenu from './ContextMenu';
import {
  toDateKey,
  parseDateKey,
  addDays,
  diffDays,
  tierIndex,
  tierHex,
  tierBrightness,
  tierGlow,
  hexToRgb,
  visibleDayCount,
  seededRandom,
  motionPeriod,
  orbitPeriod
} from '../lib/logic';

// 圆润四芒星：尖角用 round linejoin 磨圆，观感柔软无侵略性
const STAR4_PATH =
  'M50 7 C54 30 65 41 93 50 C65 59 54 70 50 93 C46 70 35 59 7 50 C35 41 46 30 50 7 Z';

// 虚线与实心必须共用同一轮廓，才能保证形状一致
const CIRCLE_PATH = 'M50 6 A44 44 0 1 0 50 94 A44 44 0 1 0 50 6 Z';
const ROUNDED_PATH =
  'M32 6 H68 A26 26 0 0 1 94 32 V68 A26 26 0 0 1 68 94 H32 A26 26 0 0 1 6 68 V32 A26 26 0 0 1 32 6 Z';

const MOTION = ['float-a', 'float-b', 'float-c', 'float-d', 'float-e', 'float-f', 'float-g', 'float-h'];

function pathOf(shape) {
  if (shape === 'circle') return CIRCLE_PATH;
  if (shape === 'rounded') return ROUNDED_PATH;
  return STAR4_PATH;
}

// 印痕卫星：圆点沿倾斜椭圆环绕，尾迹由多段递减的短弧拼成，越远越细越淡
// 逐帧计算位置，避免父级缩放把圆点压扁
const ORBIT_A = 46; // 横向半径（viewBox 单位）
const ORBIT_B = 27; // 纵向半径
const TAIL_SPAN = 1.55; // 尾迹覆盖的弧度
const TAIL_SEGS = 20; // 亮芯分段数
const HALO_SEGS = 10; // 光晕分段数

function OrbitTrail({ period, animate }) {
  const headRef = useRef(null);
  const tailRef = useRef(null);
  const coreRefs = useRef([]);
  const haloRefs = useRef([]);

  useEffect(() => {
    const cx = 50;
    const cy = 50;
    const TAU = Math.PI * 2;
    let raf = 0;

    const px = (t) => (cx + ORBIT_A * Math.cos(t)).toFixed(2);
    const py = (t) => (cy + ORBIT_B * Math.sin(t)).toFixed(2);

    // 沿椭圆逐段铺排，相邻段首尾共用端点，不重叠才不会出现亮斑
    const layout = (refs, segs) => {
      for (let i = 0; i < segs; i++) {
        const el = refs.current[i];
        if (!el) continue;
        const t1 = th - TAIL_SPAN * (i / segs);
        const t2 = th - TAIL_SPAN * ((i + 1) / segs);
        el.setAttribute('d', `M${px(t1)} ${py(t1)}L${px(t2)} ${py(t2)}`);
      }
    };

    let th = 0;
    const draw = (p) => {
      // 所有卫星共用同一绝对时钟，任何时刻都处于同一角度，整体整齐不凌乱
      th = p * TAU;

      // 上半圈视为绕到星点背后，整体压暗
      const depth = (Math.sin(th) + 1) / 2;

      if (headRef.current) {
        headRef.current.setAttribute('cx', px(th));
        headRef.current.setAttribute('cy', py(th));
      }
      if (tailRef.current) {
        tailRef.current.setAttribute('opacity', (0.55 + depth * 0.45).toFixed(2));
      }

      layout(coreRefs, TAIL_SEGS);
      layout(haloRefs, HALO_SEGS);
    };

    // 关闭环绕动效时不跑逐帧刷新，改为在星点右下角显示一个固定光点
    if (!animate) return undefined;

    const tick = (now) => {
      draw((now % period) / period);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [period, animate]);

  if (!animate) {
    return (
      <span className="orbit-wrap" aria-hidden="true">
        <svg viewBox="0 0 100 100" className="orbit-svg is-fixed">
          <circle className="orbit-head" cx="76" cy="76" r="4.2" />
        </svg>
      </span>
    );
  }

  return (
    <span className="orbit-wrap" aria-hidden="true">
      <svg viewBox="0 0 100 100" className="orbit-svg">
        {Array.from({ length: HALO_SEGS }).map((_, i) => {
          const f = i / (HALO_SEGS - 1);
          return (
            <path
              key={`h${i}`}
              ref={(el) => (haloRefs.current[i] = el)}
              className="orbit-tail-halo"
              style={{
                strokeWidth: (5.6 * Math.pow(1 - f, 0.5)).toFixed(2),
                strokeOpacity: (0.3 * Math.pow(1 - f, 1.2)).toFixed(3)
              }}
            />
          );
        })}
        <g ref={tailRef}>
          {Array.from({ length: TAIL_SEGS }).map((_, i) => {
            const f = i / (TAIL_SEGS - 1);
            return (
              <path
                key={`c${i}`}
                ref={(el) => (coreRefs.current[i] = el)}
                className="orbit-tail-seg"
                style={{
                  strokeWidth: (2.6 * Math.pow(1 - f, 0.5)).toFixed(2),
                  strokeOpacity: (0.94 * Math.pow(1 - f, 1.15)).toFixed(3)
                }}
              />
            );
          })}
        </g>
        <circle ref={headRef} className="orbit-head" r="4.2" />
      </svg>
    </span>
  );
}

function Shape({ shape, color, ghost }) {
  // 归一化后等分成 10 个周期，断口短且分散，四芒星读起来是一个完整轮廓
  // 叠加极淡填充，让"空槽"有体积感而不是几段悬空弧线
  if (ghost) {
    return (
      <path
        d={pathOf(shape)}
        pathLength="100"
        fill="currentColor"
        fillOpacity="0.07"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeDasharray="8.5 1.5"
        strokeLinecap="butt"
        strokeLinejoin="round"
      />
    );
  }
  return (
    <path
      d={pathOf(shape)}
      fill={color}
      stroke={color}
      strokeWidth="6"
      strokeLinejoin="round"
    />
  );
}

// 漂浮参数：以日期为种子，保证同一颗星每次渲染轨迹一致；
// 方向、幅度、周期、相位都单独随机，整体看起来更自然。
// 星点本体与印痕卫星共用同一份参数，卫星才能始终贴合在星点的相对位置上
export function starMotionStyle(dateKey, motion) {
  if (!motion || !motion.enabled) return { animation: 'none' };
  const rnd = seededRandom(dateKey + '-m');
  const ampScale = 0.55 + rnd() * 0.45;
  const baseSeconds = motionPeriod(motion.speed);
  const duration = baseSeconds * (1 + rnd() * 0.4);
  return {
    animationName: MOTION[Math.floor(rnd() * MOTION.length)],
    animationDuration: `${duration.toFixed(2)}s`,
    animationDelay: `${(-rnd() * duration).toFixed(2)}s`,
    '--amp': `${(motion.amplitude * ampScale).toFixed(2)}px`
  };
}

// 单颗星点
function Star({ dateKey, points, tiers, isToday, isFuture, shape, color, motion, children }) {
  const level = tierIndex(points, tiers);
  const lit = level >= 0;
  const tier = level >= 0 ? tiers[level] : null;
  const brightness = tierBrightness(tier, level);
  const glow = tierGlow(tier, level);

  const fillColor = tierHex(color, level, tier);
  const { r, g, b } = hexToRgb(fillColor);

  const motionStyle = useMemo(() => starMotionStyle(dateKey, motion), [dateKey, motion]);

  const glowStyle = useMemo(() => {
    if (!lit) return {};
    return {
      filter:
        `brightness(${brightness.toFixed(2)}) ` +
        `drop-shadow(0 0 ${(2 + glow * 9).toFixed(1)}px rgba(${r},${g},${b},${(0.34 + glow * 0.24).toFixed(2)})) ` +
        `drop-shadow(0 0 ${(6 + glow * 20).toFixed(1)}px rgba(${r},${g},${b},${(0.10 + glow * 0.12).toFixed(2)}))`
    };
  }, [lit, brightness, glow, r, g, b]);

  return (
    <div
      className={`star shape-${shape} ${isToday ? 'is-today' : ''} ${isFuture ? 'is-future' : ''} ${lit ? 'is-lit' : ''}`}
      style={motionStyle}
    >
      <svg
        viewBox="0 0 100 100"
        className="star-svg"
        style={{ color: lit ? fillColor : 'rgba(178, 205, 255, 0.62)', ...glowStyle }}
      >
        <Shape
          shape={shape}
          color={lit ? fillColor : 'rgba(160,190,255,0.09)'}
          ghost={isFuture}
        />
      </svg>
      {children}
    </div>
  );
}

export default function StarField({
  days,
  tiers,
  todayKey,
  startDateKey,
  settings,
  marks,
  onSelectDay,
  pactEnabled = false,
  pacts = {},
  onPactDay
}) {
  const [tip, setTip] = useState(null);
  // 今天既是「写印痕」又是「立对赌」的候选，单点无法区分，用一个小菜单让用户选
  const [todayMenu, setTodayMenu] = useState(null);
  const { starShape, starColor, starMotion } = settings;

  const { rows, dayNumber } = useMemo(() => {
    const today = parseDateKey(todayKey);
    const start = parseDateKey(startDateKey);
    const dn = Math.max(1, diffDays(start, today) + 1);
    const total = visibleDayCount(dn);

    const cells = [];
    for (let i = 0; i < total; i++) {
      const d = addDays(start, i);
      const key = toDateKey(d);
      cells.push({
        key,
        points: days[key] || 0,
        isToday: key === todayKey,
        isFuture: d > today
      });
    }

    const grouped = [];
    for (let i = 0; i < cells.length; i += 7) {
      grouped.push(cells.slice(i, i + 7));
    }
    return { rows: grouped, dayNumber: dn };
  }, [days, todayKey, startDateKey]);

  return (
    <div className="starfield">
      {rows.map((row, ri) => (
        <div className="star-row" key={ri}>
          <div className="star-row-label">
            <span>第 {ri + 1} 周</span>
          </div>
          <div className="star-row-cells">
            {row.map((cell) => {
              const level = tierIndex(cell.points, tiers);
              const lit = level >= 0;
              const hasMark = Boolean(marks && marks[cell.key]);
              const hasPact = Boolean(pacts && pacts[cell.key] && pacts[cell.key].status === 'pending');
              // 已点亮的过去日期用于写印痕；今天与未来未点亮的星点在开启对赌后可点击设目标
              const markTarget = lit && !cell.isFuture && Boolean(onSelectDay);
              const pactTarget = !lit && (cell.isFuture || cell.isToday) && pactEnabled && Boolean(onPactDay);
              // 今天已点亮时两种操作都成立，点击弹出选择菜单
              const todayBoth = cell.isToday && lit && pactEnabled && Boolean(onPactDay);
              const clickable = markTarget || pactTarget || todayBoth;

              return (
                <div
                  key={cell.key}
                  className={`star-slot ${clickable ? 'is-clickable' : ''} ${pactTarget ? 'is-pact-target' : ''}`}
                  onClick={clickable ? (e) => {
                    if (todayBoth) {
                      setTodayMenu({ key: cell.key, x: e.clientX, y: e.clientY });
                    } else if (pactTarget) {
                      onPactDay(cell.key);
                    } else {
                      onSelectDay(cell.key);
                    }
                  } : undefined}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTip({
                      x: rect.left + rect.width / 2,
                      y: rect.top,
                      key: cell.key,
                      points: cell.points,
                      level,
                      isFuture: cell.isFuture,
                      isToday: cell.isToday,
                      hasMark,
                      hasPact,
                      pactTarget,
                      todayBoth,
                      clickable
                    });
                  }}
                  onMouseLeave={() => setTip(null)}
                >
                  <Star
                    dateKey={cell.key}
                    points={cell.points}
                    tiers={tiers}
                    isToday={cell.isToday}
                    isFuture={cell.isFuture}
                    shape={starShape}
                    color={starColor}
                    motion={starMotion}
                  >
                    {hasPact && <span className="pact-dot" aria-hidden="true" />}
                    {hasMark && (
                      <OrbitTrail
                        period={orbitPeriod(settings.orbit.speed)}
                        animate={settings.orbit.enabled !== false}
                      />
                    )}
                  </Star>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {tip && (
        <div className="graph-tooltip" style={{ left: tip.x, top: tip.y - 12 }}>
          <div className="tip-date">
            {tip.key}
            {tip.isToday && <span className="tip-tag">今天</span>}
            {tip.isFuture && <span className="tip-tag">未开始</span>}
          </div>
          <div className="tip-pts">
            {tip.isFuture ? (
              '等待点亮'
            ) : tip.points > 0 ? (
              <>
                <span className="tip-num">{tip.points.toLocaleString()}</span> 积分
                {tip.level >= 0 && (
                  <span className="tip-tier" style={{ color: starColor }}>
                    · L{tip.level + 1}
                  </span>
                )}
              </>
            ) : (
              '未点亮'
            )}
          </div>
          {tip.hasMark && <div className="tip-mark">此处有印痕</div>}
          {tip.hasPact && <div className="tip-pact">已立下对赌</div>}
          {tip.clickable && (
            <div className="tip-hint">
              {tip.todayBoth
                ? '点击查看印痕或立下对赌'
                : tip.pactTarget ? '点击设置对赌' : (tip.hasMark ? '点击查看印痕' : '点击写下印痕')}
            </div>
          )}
        </div>
      )}

      {todayMenu && (
        <ContextMenu
          x={todayMenu.x}
          y={todayMenu.y}
          items={[
            { label: '写下今日印痕', onClick: () => onSelectDay(todayMenu.key) },
            { label: '为今天立下对赌', onClick: () => onPactDay(todayMenu.key) }
          ]}
          onClose={() => setTodayMenu(null)}
        />
      )}
    </div>
  );
}
