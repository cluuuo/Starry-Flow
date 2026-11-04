import React, { useEffect, useState } from 'react';
import {
  mergeSettings,
  DEFAULT_SETTINGS,
  logicalDateKey,
  tierIndex,
  tierHex,
  hexToRgb,
  hsvToHex
} from '../lib/logic';

// 与主界面星点共用的四芒星轮廓
const STAR4_PATH =
  'M50 7 C54 30 65 41 93 50 C65 59 54 70 50 93 C46 70 35 59 7 50 C35 41 46 30 50 7 Z';

// 只显示一颗星点与今日积分：整个面板由系统原生拖动，右上角按钮切回极简模式
export default function MiniApp() {
  const [focus, setFocus] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  // 预览状态：预览时隐藏右上角的模式切换按钮，避免误把主窗口切走
  const [preview, setPreview] = useState(false);

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
    // 主窗口保存设置后立即重读，拖动滑块时预览能马上反映改动
    const off = window.api.onSettingsChanged ? window.api.onSettingsChanged(load) : null;
    return () => {
      alive = false;
      clearInterval(timer);
      if (off) off();
    };
  }, []);

  // 预览由设置页的开关驱动，主进程推送状态
  useEffect(() => {
    if (!window.api) return undefined;
    let alive = true;
    if (window.api.getMiniPreview) {
      window.api.getMiniPreview()
        .then((v) => { if (alive) setPreview(v === true); })
        .catch(() => { /* 忽略 */ });
    }
    const off = window.api.onMiniPreview
      ? window.api.onMiniPreview((v) => setPreview(v === true))
      : null;
    return () => {
      alive = false;
      if (off) off();
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
  const mini = settings.mini;
  // 档位色：积分越高越亮；关闭跟随后统一用星点主色
  const tierColor = lit ? tierHex(settings.starColor, level, tier) : settings.starColor;
  const fillColor = mini.starFollowTier ? tierColor : settings.starColor;
  const rgb = hexToRgb(fillColor);
  const pointsColor = mini.numberFollowTier ? tierColor : '#141a2c';

  // 面板：HSV 底色 + 不透明度；尺寸同步给窗口，鼠标判定范围始终等于面板
  const panelRgb = hexToRgb(hsvToHex(mini.bgHue, mini.bgSaturation, mini.bgValue));
  const panelStyle = {
    background: `rgba(${panelRgb.r},${panelRgb.g},${panelRgb.b},${(mini.bgAlpha / 100).toFixed(2)})`,
    borderColor: `rgba(${panelRgb.r},${panelRgb.g},${panelRgb.b},${Math.min(1, mini.bgAlpha / 100 + 0.2).toFixed(2)})`
  };

  // 星点与数字共用一套阴影参数：颜色 / 深度（偏移）/ 范围（模糊）
  const shadow = `${mini.shadowDepth}px ${mini.shadowDepth}px ${mini.shadowBlur}px ${mini.shadowColor}`;
  const starShadowStyle = { filter: `drop-shadow(${shadow})` };

  const lost = !!focus?.focus_lost;
  const strictOn = !!focus?.settings?.strict?.enabled;

  // 面板尺寸变化时通知主进程调整窗口大小
  useEffect(() => {
    if (!window.api || !window.api.setMiniSize) return;
    window.api.setMiniSize({ width: mini.width, height: mini.height });
  }, [mini.width, mini.height]);

  // 拖动交给窗口管理器的原生拖拽区（-webkit-app-region: drag）：
  // 自己用 setPosition 跟随光标会形成“窗口追光标”的正反馈，按住不动也会漂移
  const backToCompact = () => {
    if (window.api) window.api.activateMini();
  };

  const ringColor = `rgba(${rgb.r},${rgb.g},${rgb.b},0.62)`;

  return (
    <div className="mini-root" style={panelStyle}>
      {!preview && (
        <button
          className="mini-switch"
          onClick={backToCompact}
          title="切回极简模式"
          aria-label="切回极简模式"
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3.5 8.5l5-5M5 3.5h3.5V7" />
          </svg>
        </button>
      )}
      <div className="mini-star-area">
        {strictOn && (
          <span className="mini-ring" style={{ '--ring-color': ringColor }} aria-hidden="true" />
        )}
        <div className="mini-star-float">
          <svg viewBox="0 0 100 100" style={{ color: fillColor, ...starShadowStyle }} aria-hidden="true">
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
        style={lost ? undefined : { color: pointsColor, textShadow: shadow }}
      >
        {points.toLocaleString()}
      </div>
    </div>
  );
}
