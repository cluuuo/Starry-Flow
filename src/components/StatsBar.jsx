import React from 'react';
import { computeStreak } from '../lib/logic';

export default function StatsBar({ days, todayKey, dayStartMinutes, tiers }) {
  const validThreshold = tiers[0].points;
  const entries = Object.entries(days);

  const totalPoints = entries.reduce((s, [, p]) => s + p, 0);
  const validDays = entries.filter(([, p]) => p >= validThreshold).length;
  const bestDay = entries.reduce((m, [, p]) => Math.max(m, p), 0);
  const streak = computeStreak(
    Object.fromEntries(entries.filter(([, p]) => p >= validThreshold)),
    todayKey,
    dayStartMinutes
  );

  const stats = [
    { label: '总获积分池', value: totalPoints.toLocaleString() },
    { label: '连续签到', value: `${streak} 天` },
    { label: '有效天数', value: `${validDays} 天` },
    { label: '单日最高', value: bestDay.toLocaleString() }
  ];

  return (
    <div className="stats-bar">
      {stats.map((s) => (
        <div key={s.label} className="stat-card card">
          <div className="stat-value">{s.value}</div>
          <div className="stat-label">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
