import { parseDateKey, addDays, toDateKey } from './logic';

// 演示用：从起始日生成到昨天的积分，今天的由 mockTodayPoints 提供
export function generateMockDays(startDateKey, dayNumber) {
  const days = {};
  const start = parseDateKey(startDateKey);

  for (let i = 0; i < dayNumber - 1; i++) {
    const d = addDays(start, i);
    const r = Math.random();
    let pts = 0;
    if (r < 0.12) {
      pts = 0;
    } else if (r < 0.42) {
      pts = 800 + Math.random() * 700;
    } else if (r < 0.67) {
      pts = 3000 + Math.random() * 2000;
    } else if (r < 0.85) {
      pts = 7000 + Math.random() * 3000;
    } else if (r < 0.95) {
      pts = 12000 + Math.random() * 4000;
    } else {
      pts = 20000 + Math.random() * 6000;
    }
    days[toDateKey(d)] = Math.round(pts);
  }
  return days;
}

export function mockTodayPoints() {
  return 2400 + Math.floor(Math.random() * 900);
}
