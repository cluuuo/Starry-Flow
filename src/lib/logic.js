// ---------- 逻辑日（自定义日切） ----------
// 规则：一天从「新一天开始时刻」起算；早于该时刻的时间归入前一天。
// 例：默认 07:00 开始新一天，则 20:00 ~ 次日 04:00 的活动都计入当天。

export function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function logicalDateKey(date, dayStartMinutes = 7 * 60) {
  const d = new Date(date);
  const minutes = d.getHours() * 60 + d.getMinutes();
  if (minutes < dayStartMinutes) {
    d.setDate(d.getDate() - 1);
  }
  return toDateKey(d);
}

// ---------- 档位 ----------
// tiers 升序：[{ points, color }, ...]，points 为达到该档的最低积分
export function tierIndex(points, tiers) {
  let idx = -1;
  for (let i = 0; i < tiers.length; i++) {
    if (points >= tiers[i].points) idx = i;
  }
  return idx; // -1 表示未达任何档位
}

export function nextTier(points, tiers) {
  for (const t of tiers) {
    if (points < t.points) return t;
  }
  return null;
}

// ---------- 默认设置 ----------
export const DEFAULT_SETTINGS = {
  dayStartMinutes: 7 * 60,   // 新一天从 07:00 开始
  settleMinutes: 4 * 60,     // 次日 04:00 封存结算前一天
  background: {
    hue: 222,                // 底色色相 0-360
    saturation: 60,          // 饱和度 0-100，默认比纯深蓝更柔和
    value: 13                // 明度 0-100，默认保持夜空档位
  },
  tiers: [
    { points: 1000, color: null, brightness: 0.92, glow: 0.35 },
    { points: 3000, color: null, brightness: 1.08, glow: 0.6 },
    { points: 7000, color: null, brightness: 1.26, glow: 0.9 },
    { points: 12000, color: null, brightness: 1.46, glow: 1.25 },
    { points: 20000, color: null, brightness: 1.62, glow: 1.7 }
  ],
  starShape: 'star4',        // star4 | circle | rounded
  starColor: '#ffd75e',      // 星点主色，默认明黄
  starMotion: {
    enabled: true,
    amplitude: 2,            // 漂移幅度 px，上限 12
    speed: 3                 // 档位 1-5，越高晃动越快
  },
  orbit: {
    enabled: true,           // 印痕星点的环绕卫星动效
    speed: 3                 // 档位 1-5，3 档为默认环绕速度
  },
  sky: {
    density: 1,              // 星点密度倍数 0.4 ~ 2
    animated: true,          // 星空动态效果：星野流动、星星闪烁、流星
    followPoints: true,      // 积分越高夜空流动越快
    flowSpeed: 3             // 流动速度档位 1-5，越高越快
  },
  settingsTab: 'appearance'  // 设置窗口上次停留的分类
};

// 星点漂浮速度：1-5 档，档位越高周期越短（5 档为最快 1 秒）
export const MOTION_PERIODS = [20, 12, 6, 3, 1];

export function motionPeriod(level) {
  const i = Math.max(0, Math.min(MOTION_PERIODS.length - 1, Math.round(Number(level) || 3) - 1));
  return MOTION_PERIODS[i];
}

// 星空流动速度：1-5 档，档位越高基础周期越短
export const SKY_PERIODS = [60, 40, 28, 18, 10];

export function skyFlowPeriod(level) {
  const i = Math.max(0, Math.min(SKY_PERIODS.length - 1, Math.round(Number(level) || 3) - 1));
  return SKY_PERIODS[i];
}

// 印痕卫星环绕速度：1-5 档，档位越高环绕一周越快（3 档 3.8 秒为默认）
export const ORBIT_PERIODS = [7000, 5200, 3800, 2600, 1600];

export function orbitPeriod(level) {
  const i = Math.max(0, Math.min(ORBIT_PERIODS.length - 1, Math.round(Number(level) || 3) - 1));
  return ORBIT_PERIODS[i];
}

// 旧存档里 sky.baseDuration 存的是秒数，迁移时折算成新档位
function durationToLevel(seconds) {
  if (seconds <= 12) return 5;
  if (seconds <= 20) return 4;
  if (seconds <= 32) return 3;
  if (seconds <= 45) return 2;
  return 1;
}

// 旧存档里 speed 存的是秒数，迁移时按周期折算成新档位
function speedToLevel(seconds) {
  if (seconds <= 1.5) return 5;
  if (seconds <= 3.5) return 4;
  if (seconds <= 8) return 3;
  if (seconds <= 15) return 2;
  return 1;
}

// 兼容旧版存档：缺失字段用默认值补齐，并丢弃已废弃的逐档颜色
export function mergeSettings(saved) {
  const base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (!saved || typeof saved !== 'object') return base;

  const out = { ...base, ...saved };
  const motionSaved = saved.starMotion || {};
  out.starMotion = { ...base.starMotion, ...motionSaved };
  const rawSpeed = Number(motionSaved.speed);
  out.starMotion.speed = Number.isFinite(rawSpeed)
    ? (rawSpeed > 5 ? speedToLevel(rawSpeed) : Math.max(1, Math.min(5, Math.round(rawSpeed))))
    : base.starMotion.speed;
  const rawAmp = Number(motionSaved.amplitude);
  out.starMotion.amplitude = Number.isFinite(rawAmp)
    ? Math.max(0, Math.min(12, rawAmp))
    : base.starMotion.amplitude;
  const orbitSaved = saved.orbit || {};
  out.orbit = { ...base.orbit, ...orbitSaved };
  out.orbit.enabled = orbitSaved.enabled !== false;
  const rawOrbitSpeed = Number(orbitSaved.speed);
  out.orbit.speed = Number.isFinite(rawOrbitSpeed)
    ? Math.max(1, Math.min(5, Math.round(rawOrbitSpeed)))
    : base.orbit.speed;
  const skySaved = saved.sky || {};
  out.sky = { ...base.sky, ...skySaved };
  const rawFlow = Number(skySaved.flowSpeed);
  const rawDuration = Number(skySaved.baseDuration);
  out.sky.flowSpeed = Number.isFinite(rawFlow)
    ? Math.max(1, Math.min(5, Math.round(rawFlow)))
    : (Number.isFinite(rawDuration) ? durationToLevel(rawDuration) : base.sky.flowSpeed);
  delete out.sky.baseDuration;
  out.background = { ...base.background, ...(saved.background || {}) };
  out.settingsTab = ['rules', 'backup'].includes(saved.settingsTab) ? saved.settingsTab : 'appearance';

  if (Array.isArray(saved.tiers) && saved.tiers.length) {
    out.tiers = saved.tiers.map((t, i) => ({
      points: Number.isFinite(Number(t.points)) ? Number(t.points) : base.tiers[i].points,
      color: typeof t.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(t.color) ? t.color : null,
      brightness: Number.isFinite(Number(t.brightness)) ? Number(t.brightness) : base.tiers[i].brightness,
      glow: Number.isFinite(Number(t.glow)) ? Number(t.glow) : base.tiers[i].glow
    }));
  }
  return out;
}

// 背景设置：HSV（色相 0-360、饱和度 0-100、明度 0-100）转为十六进制
export function hsvToHex(h, s, v) {
  const hh = (((Number(h) || 0) % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(100, Number(s) || 0)) / 100;
  const vv = Math.max(0, Math.min(100, Number(v) || 0)) / 100;
  const c = vv * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vv - c;
  let rgb;
  if (hh < 60) rgb = [c, x, 0];
  else if (hh < 120) rgb = [x, c, 0];
  else if (hh < 180) rgb = [0, c, x];
  else if (hh < 240) rgb = [0, x, c];
  else if (hh < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const to = (n) => Math.max(0, Math.min(255, Math.round((n + m) * 255)));
  return `#${rgb.map((n) => to(n).toString(16).padStart(2, '0')).join('')}`;
}

// 由背景 HSV 派生整套界面底色，让卡片、边框与背景保持同一色系
export function backgroundVars(bg) {
  const h = Number.isFinite(Number(bg?.hue)) ? Number(bg.hue) : 222;
  const s = Number.isFinite(Number(bg?.saturation)) ? Number(bg.saturation) : 60;
  const v = Number.isFinite(Number(bg?.value)) ? Number(bg.value) : 13;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  return {
    '--bg': hsvToHex(h, s, v),
    '--bg-deep': hsvToHex(h, s, clamp(v - 4, 2, 100)),
    '--card': hsvToHex(h, s * 0.92, clamp(v + 6.5, 4, 100)),
    '--card-hover': hsvToHex(h, s * 0.9, clamp(v + 11, 4, 100)),
    '--border': hsvToHex(h, s * 0.8, clamp(v + 16, 4, 100)),
    '--border-soft': hsvToHex(h, s * 0.85, clamp(v + 10, 4, 100)),
    '--cell-empty': hsvToHex(h, s * 0.8, clamp(v + 13, 4, 100))
  };
}

// 档位亮度：0 档最暗，最高档过曝发白，形成明显的视觉刺激
export function hexToRgb(hex) {
  const h = (hex || '#ffd75e').replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(v.slice(0, 2), 16) || 0,
    g: parseInt(v.slice(2, 4), 16) || 0,
    b: parseInt(v.slice(4, 6), 16) || 0
  };
}

function toHex(n) {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return v.toString(16).padStart(2, '0');
}

// 档位色：未自定义时向白色混合，越高档越白
export function tierHex(baseHex, level, tier) {
  if (tier && tier.color) return tier.color;
  const mix = level < 0 ? 0 : [0, 0.1, 0.26, 0.5, 0.78][level] ?? 0;
  const { r, g, b } = hexToRgb(baseHex);
  return `#${toHex(r + (255 - r) * mix)}${toHex(g + (255 - g) * mix)}${toHex(b + (255 - b) * mix)}`;
}

export function tierBrightness(tier, level) {
  if (!tier) return 0.6;
  return Number.isFinite(tier.brightness) ? tier.brightness : [0.92, 1.08, 1.26, 1.46, 1.62][level] ?? 1;
}

export function tierGlow(tier, level) {
  if (!tier) return 0;
  return Number.isFinite(tier.glow) ? tier.glow : [0.35, 0.6, 0.9, 1.25, 1.7][level] ?? 1;
}

// 稳定伪随机：同一日期永远得到同一组参数，重渲染时星点不会乱跳
export function seededRandom(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function minutesToTimeStr(m) {
  const h = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${h}:${mm}`;
}

export function timeStrToMinutes(s) {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// 两个日期相差的天数（只按日历日算）
export function diffDays(a, b) {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / 86400000);
}

// ---------- 渐进解锁 ----------
// 第 1 天：今天 + 明天（2 格）
// 第 2 天：昨天 + 今天 + 明天（3 格）
// 第 3 天起：补满所在的一周（7 格）
// 第 8 天：新增下一周空槽（14 格），此后每周递进
export function visibleDayCount(dayNumber) {
  if (dayNumber <= 1) return 2;
  if (dayNumber === 2) return 3;
  return Math.ceil(dayNumber / 7) * 7;
}

// ---------- 阶段引导文案 ----------
export function journeyMessage(dayNumber, weekCount) {
  if (dayNumber === 1) {
    return {
      title: '今天，点亮第一颗星',
      sub: '明天也要来哦'
    };
  }
  if (dayNumber === 2) {
    return {
      title: '昨天已经亮起，今天继续',
      sub: '做的很棒！第三天也继续吧！'
    };
  }
  if (dayNumber === 7) {
    return {
      title: '恭喜！这是属于你的里程碑！',
      sub: '七天不是终点，是你证明过自己的证据'
    };
  }
  if (dayNumber > 7 && dayNumber % 7 === 0) {
    return {
      title: `第 ${weekCount} 周达成`,
      sub: '新的开始，继续你的征途！'
    };
  }
  if (dayNumber > 7 && (dayNumber - 1) % 7 === 0) {
    return {
      title: '新的七天，从这里开始',
      sub: '回头望望，每一个脚印都是梦想星空的一颗星星！'
    };
  }
  if (dayNumber >= 3 && dayNumber < 7) {
    return {
      title: '本周已走过将近一半！',
      sub: '只差几步，就是完整的一周'
    };
  }
  return {
    title: `第 ${weekCount} 周 · 第 ${(dayNumber - 1) % 7 + 1} 天`,
    sub: '保持这个节奏！你曾做到过，明天你也一定能行！'
  };
}

// ---------- 统计 ----------
export function computeStreak(days, todayKey, dayStartMinutes) {
  // 从昨天（逻辑日）往前数连续有效天数；今天若已有效则计入
  let streak = 0;
  const d = new Date();
  const nowKey = logicalDateKey(d, dayStartMinutes);
  let cursor = new Date(d);
  if (days[nowKey] > 0) streak++;
  // 往前推
  cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < 370; i++) {
    const key = toDateKey(cursor);
    if (days[key] > 0) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}
