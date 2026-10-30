import React from 'react';

// 窗口底部提示：淡入 → 停留约 3 秒 → 淡出，动画由 CSS 的 toast-in-out 完成
export default function Toast({ notice }) {
  if (!notice) return null;
  return (
    <div
      key={notice.id}
      className={`app-toast ${notice.ok ? 'ok' : 'fail'}`}
      role="status"
      aria-live="polite"
    >
      {notice.message}
    </div>
  );
}
