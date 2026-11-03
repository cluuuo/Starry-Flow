import { computeStreak } from './logic';

// ---------- 成就定义 ----------
// 成就条目集中在这里维护：名称、说明与达成条件都在本表内，界面与数据无需改动。
// metric(ctx) 返回「累计达成次数」，大于历史记录时补发对应数量的纪念章；
// 因此同一成就可反复获得（例如积分池每满一万加一枚），记录天然幂等、可回算。
export const ACHIEVEMENTS = [
  {
    id: 'first-light',
    name: '初光',
    art: 'star',
    desc: '点亮第一颗星',
    metric: (ctx) => (ctx.validDays > 0 ? 1 : 0)
  },
  {
    id: 'valid-day',
    name: '微光日',
    art: 'dots',
    desc: '每有一个有效日获得一枚',
    metric: (ctx) => ctx.validDays
  },
  {
    id: 'week-streak',
    name: '七日星轨',
    art: 'orbit',
    desc: '连续签到每满七天获得一枚',
    metric: (ctx) => Math.floor(ctx.streak / 7)
  },
  {
    id: 'pool-ten-thousand',
    name: '积星成河',
    art: 'river',
    desc: '总获积分池每满一万获得一枚',
    metric: (ctx) => Math.floor(ctx.totalPoints / 10000)
  },
  {
    id: 'peak-night',
    name: '璀璨之夜',
    art: 'flare',
    desc: '单日积分达到最高档',
    metric: (ctx) => ctx.topDays
  },
  {
    id: 'sleep-early',
    name: '乖乖睡觉',
    art: 'moon',
    desc: '在健康就寝时间之后完成当日结算',
    metric: (ctx) => ctx.sleepSettles
  },
  {
    id: 'debt-cleared',
    name: '平账大师',
    art: 'scale',
    desc: '填平全部赤字积分',
    metric: (ctx) => ctx.deficitCleared
  },
  {
    id: 'pact-won',
    name: '对赌成功',
    art: 'pact',
    desc: '达成一次对赌协议目标',
    metric: (ctx) => ctx.pactSuccess
  }
];

// 把星图数据整理成成就判定需要的口径
export function buildAchievementContext({ days, todayKey, dayStartMinutes, tiers, counters }) {
  const entries = Object.entries(days || {}).filter(([, points]) => Number(points) > 0);
  const totalPoints = entries.reduce((sum, [, points]) => sum + (Number(points) || 0), 0);

  const validThreshold = (tiers && tiers[0] && tiers[0].points) || 1000;
  const topThreshold = (tiers && tiers[tiers.length - 1] && tiers[tiers.length - 1].points) || 0;

  const validEntries = entries.filter(([, points]) => points >= validThreshold);
  const validDays = validEntries.length;
  const topDays = entries.filter(([, points]) => points >= topThreshold).length;
  const bestDay = entries.reduce((max, [, points]) => Math.max(max, points), 0);
  const streak = computeStreak(
    Object.fromEntries(validEntries),
    todayKey,
    dayStartMinutes
  );

  // 采集端记录的事件计数：就寝结算、对赌达成、赤字填平
  const counts = counters && typeof counters === 'object' ? counters : {};
  const countOf = (key) => Math.max(0, Math.floor(Number(counts[key]) || 0));

  return {
    totalPoints,
    validDays,
    topDays,
    bestDay,
    streak,
    validThreshold,
    sleepSettles: countOf('sleep_settles'),
    pactSuccess: countOf('pact_success'),
    deficitCleared: countOf('deficit_cleared')
  };
}

// 校验磁盘上的存档：只接受形如 { version, unlocked: { id: { count, firstAt, lastAt } } } 的结构
export function createAchievementState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const saved = src.unlocked && typeof src.unlocked === 'object' ? src.unlocked : {};
  const unlocked = {};

  Object.keys(saved).forEach((id) => {
    const item = saved[id];
    const count = Math.max(0, Math.floor(Number(item && item.count) || 0));
    if (!count) return;
    unlocked[id] = {
      count,
      firstAt: Number(item.firstAt) || 0,
      lastAt: Number(item.lastAt) || 0
    };
  });

  return { version: 1, unlocked };
}

// 与最新数据比对，返回补齐后的存档与本次新获得的纪念章
export function syncAchievements(state, ctx, now = Date.now()) {
  const base = state && state.unlocked ? state : createAchievementState(state);
  const unlocked = { ...base.unlocked };
  const gained = [];

  ACHIEVEMENTS.forEach((item) => {
    const target = Math.max(0, Math.floor(item.metric(ctx) || 0));
    const current = unlocked[item.id];
    const have = current ? current.count : 0;
    if (target <= have) return;

    unlocked[item.id] = {
      count: target,
      firstAt: (current && current.firstAt) || now,
      lastAt: now
    };
    gained.push({
      id: item.id,
      name: item.name,
      count: target,
      added: target - have
    });
  });

  return { state: { version: 1, unlocked }, gained };
}

// 展厅只展示已经获得的纪念章，按累计数量降序排列
export function earnedAchievements(state) {
  const unlocked = (state && state.unlocked) || {};
  return ACHIEVEMENTS.map((item) => ({
    ...item,
    count: (unlocked[item.id] && unlocked[item.id].count) || 0
  }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function totalMedals(state) {
  return earnedAchievements(state).reduce((sum, item) => sum + item.count, 0);
}
