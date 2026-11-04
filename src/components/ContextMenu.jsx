import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// 轻量右键菜单：挂到 body，避免被卡片的 overflow/层叠上下文裁剪
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x, y });

  // 靠近窗口边缘时向内收；下方空间不足就向上展开，保证每一项都点得到
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    const nextX = Math.max(gap, Math.min(x, window.innerWidth - r.width - gap));
    const nextY = y + r.height + gap > window.innerHeight
      ? Math.max(gap, y - r.height)
      : y;
    setPos({ x: nextX, y: nextY });
  }, [x, y]);

  useEffect(() => {
    // 用 pointerdown 且判断是否点在菜单内，避免菜单项按下即被关闭
    const onDown = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      onClose();
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [onClose]);

  return createPortal(
    <div
      className="ctx-menu"
      ref={ref}
      style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          className="ctx-item"
          onClick={() => {
            onClose();
            item.onClick();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  );
}
