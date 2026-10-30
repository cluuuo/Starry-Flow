import React, { useEffect, useRef, useState } from 'react';
import {
  mergeSettings,
  DEFAULT_SETTINGS,
  logicalDateKey,
  tierIndex,
  tierHex,
  tierGlow,
  hexToRgb
} from '../lib/logic';

// 与主界面星点共用的四芒星轮廓
const STAR4_PATH =
  'M50 7 C54 30 65 41 93 50 C65 59 54 70 50 93 C46 70 35 59 7 50 C35 41 46 30 50 7 Z';

// 只显示一颗星点与今日积分：拖动整窗移动，单击切回极简模式
export default function MiniApp() {
  const [focus, setFocus] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('mini-doc');
    return () => document.documentElement.classList.remove('mini-doc');
  }, []);

  // 迷你窗口独立于主窗口，自己读设置（档位颜色、日切时间）；定期刷新以跟随主题色调整
  useEffect(() => {
    if (!window.api) return undefined;
    let alive = true;
    const load = async () => {
      try {
        const saved = await window.api.getSettings();
        if (alive && saved) setSettings(mergeSettings(saved));
      } catch (e) { /* 忽略 */ }
    };
    load();
    const timer = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // 与主界面同样的轮询节奏，保证数字实时变化
  useEffect(() => {
    if (!window.api) return undefined;
    let alive = true;
    const tick = async () => {
      try {
        const state = await window.api.getFocusState();
        if (alive && state) setFocus(state);
      } catch (e) { /* 忽略 */ }
    };
    tick();
    const timer = setInterval(tick, 400);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const dayStart = settings.dayStartMinutes ?? DEFAULT_SETTINGS.dayStartMinutes;
  const todayKey = logicalDateKey(new Date(), dayStart);
  const points = (focus?.days && focus.days[todayKey]) ?? focus?.today_points ?? 0;

  const level = tierIndex(points, settings.tiers);
  const tier = level >= 0 ? settings.tiers[level] : null;
  const lit = level >= 0;
  // 星点与数字使用纯净的主题色 / 档位色，不用 brightness 压暗，避免颜色发灰发脏
  const fillColor = lit ? tierHex(settings.starColor, level, tier) : settings.starColor;
  const rgb = hexToRgb(fillColor);
  const glowSize = lit ? 6 + tierGlow(tier, level) * 10 : 6;
  const glowAlpha = lit ? 0.5 : 0.32;
  const glowStyle = {
    filter: `drop-shadow(0 0 ${glowSize.toFixed(1)}px rgba(${rgb.r},${rgb.g},${rgb.b},${glowAlpha}))`
  };
  const pointsShadow =
    `0 1px 3px rgba(0,0,0,0.8), 0 0 10px rgba(0,0,0,0.5), ` +
    `0 0 18px rgba(${rgb.r},${rgb.g},${rgb.b},0.45)`;

  const lost = !!focus?.focus_lost;
  const strictOn = !!focus?.settings?.strict?.enabled;

  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    dragRef.current = { x: e.screenX, y: e.screenY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (window.api) window.api.miniDragStart();
  };

  const handlePointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.screenX - drag.x, e.screenY - drag.y) > 4) {
      drag.moved = true;
      setDragging(true);
    }
    if (drag.moved && window.api) window.api.miniDragMove();
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (window.api) window.api.miniDragEnd();
    setDragging(false);
    // 没有拖动位移视为单击 → 回到极简模式
    if (!drag.moved && window.api) window.api.activateMini();
  };

  const ringColor = `rgba(${rgb.r},${rgb.g},${rgb.b},0.62)`;

  return (
    <div
      className={`mini-root${dragging ? ' dragging' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(e) => {
        e.preventDefault();
        if (window.api) window.api.activateMini();
      }}
    >
      <div className="mini-star-area">
        {strictOn && (
          <span className="mini-ring" style={{ '--ring-color': ringColor }} aria-hidden="true" />
        )}
        <div className="mini-star-float">
          <svg viewBox="0 0 100 100" style={{ color: fillColor, ...glowStyle }} aria-hidden="true">
            <path
              d={STAR4_PATH}
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
      <div
        className={`mini-points${lost ? ' lost' : ''}`}
        style={lost ? undefined : { color: fillColor, textShadow: pointsShadow }}
      >
        {points.toLocaleString()}
      </div>
    </div>
  );
}
