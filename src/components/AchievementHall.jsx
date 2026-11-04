import React, { useEffect, useState } from 'react';

// 上次获得时间：统一成「2026-11-04 23:12」，旧存档没记录时显示破折号
function formatTime(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 纪念章中心的星形与星图保持同一轮廓
const STAR_PATH = 'M50 7 C54 30 65 41 93 50 C65 59 54 70 50 93 C46 70 35 59 7 50 C35 41 46 30 50 7 Z';

// 每枚纪念章的图形：统一 100×100 视图，颜色跟随主题色
function MedalArt({ art }) {
  switch (art) {
    case 'dots':
      return (
        <g fill="currentColor">
          <circle cx="30" cy="58" r="8" />
          <circle cx="52" cy="36" r="10" />
          <circle cx="73" cy="58" r="7" />
        </g>
      );
    case 'orbit':
      return (
        <g>
          <circle
            cx="50"
            cy="50"
            r="27"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            opacity="0.55"
            strokeDasharray="3 8"
          />
          <circle cx="50" cy="50" r="9" fill="currentColor" />
          {Array.from({ length: 7 }, (_, i) => {
            const angle = (i / 7) * Math.PI * 2 - Math.PI / 2;
            return (
              <circle
                key={i}
                cx={50 + Math.cos(angle) * 27}
                cy={50 + Math.sin(angle) * 27}
                r="3.6"
                fill="currentColor"
              />
            );
          })}
        </g>
      );
    case 'river':
      return (
        <g>
          <path
            d="M16 66 C30 46 42 78 56 60 C68 44 80 54 88 44"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path d="M31 24 l3 9 9 3 -9 3 -3 9 -3 -9 -9 -3 9 -3 z" fill="currentColor" />
        </g>
      );
    case 'flare':
      return (
        <g>
          <path d={STAR_PATH} transform="translate(27 27) scale(0.46)" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="4.5" strokeLinecap="round">
            <path d="M50 10 V20" />
            <path d="M50 90 V80" />
            <path d="M10 50 H20" />
            <path d="M90 50 H80" />
            <path d="M22 22 L29 29" />
            <path d="M78 78 L71 71" />
            <path d="M78 22 L71 29" />
            <path d="M22 78 L29 71" />
          </g>
        </g>
      );
    case 'moon':
      return (
        <g>
          <path d="M62 17 A33 33 0 1 0 62 83 A26 26 0 1 1 62 17 Z" fill="currentColor" />
          <path
            d="M70 32 h13 l-13 13 h13"
            fill="none"
            stroke="currentColor"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      );
    case 'scale':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M50 26 V76" />
          <path d="M38 78 H62" />
          <path d="M24 38 H76" />
          <path d="M24 38 L15 56 H33 Z" />
          <path d="M76 38 L67 56 H85 Z" />
          <circle cx="50" cy="22" r="4.5" fill="currentColor" stroke="none" />
        </g>
      );
    case 'pact':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M50 16 L76 26 V50 C76 66 64 77 50 84 C36 77 24 66 24 50 V26 Z" />
          <path d="M39 50 L47 59 L63 39" strokeWidth="6" />
        </g>
      );
    default:
      return <path d={STAR_PATH} fill="currentColor" />;
  }
}

export default function AchievementHall({ open, medals, onClose }) {
  // 悬停提示：显示获得条件与上次获得时间，用 fixed 定位避免被卡片裁掉
  const [tip, setTip] = useState(null);

  useEffect(() => {
    if (!open) {
      setTip(null);
      return undefined;
    }
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const tipItem = tip ? medals.find((m) => m.id === tip.id) : null;

  const kinds = medals.length;
  const total = medals.reduce((sum, item) => sum + item.count, 0);

  return (
    <div
      className="achievement-mask"
      role="dialog"
      aria-modal="true"
      aria-label="成就展厅"
      onMouseDown={onClose}
    >
      <div className="achievement-window" onMouseDown={(e) => e.stopPropagation()}>
        <header className="achievement-head">
          <div>
            <div className="achievement-title">成就展厅</div>
            <div className="achievement-sub">
              {kinds ? `已收集 ${kinds} 种 · 共 ${total.toLocaleString()} 枚纪念章` : '还没有获得纪念章'}
            </div>
          </div>
          <button className="settings-close" onClick={onClose} aria-label="关闭成就展厅">
            ×
          </button>
        </header>

        <div className="achievement-body">
          {kinds ? (
            <div className="achievement-grid">
              {medals.map((item, index) => (
                <div
                  className="medal-card"
                  key={item.id}
                  style={{ '--i': index }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTip({
                      id: item.id,
                      x: rect.left + rect.width / 2,
                      top: rect.top,
                      bottom: rect.bottom
                    });
                  }}
                  onMouseLeave={() => setTip((cur) => (cur && cur.id === item.id ? null : cur))}
                >
                  <div className="medal-stage">
                    <span className="medal-beam" aria-hidden="true" />
                    <span className="medal-floor" aria-hidden="true" />
                    <div className="medal-disc">
                      <span className="medal-dash" aria-hidden="true" />
                      <svg className="medal-mark" viewBox="0 0 100 100" aria-hidden="true">
                        <MedalArt art={item.art} />
                      </svg>
                    </div>
                  </div>
                  <div className="medal-name">{item.name}</div>
                  <div className="medal-count">获得 {item.count.toLocaleString()} 枚</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="achievement-empty">
              <div className="achievement-empty-disc" aria-hidden="true">
                <svg viewBox="0 0 100 100">
                  <path d={STAR_PATH} />
                </svg>
              </div>
              <p>达成条件后，纪念章会在这里亮起。</p>
            </div>
          )}
        </div>

        {tipItem && (
          <div
            className={`medal-tooltip ${tip.top < 290 ? 'below' : ''}`}
            style={tip.top < 290
              ? { left: tip.x, top: tip.bottom + 8 }
              : { left: tip.x, top: tip.top - 8 }}
          >
            <div className="medal-tooltip-desc">{tipItem.desc}</div>
            <div className="medal-tooltip-time">上次获得 {formatTime(tipItem.lastAt)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
