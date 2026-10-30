import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// 轻量右键菜单：跟随鼠标弹出，点击菜单外区域关闭
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x, y });

  // 靠近屏幕边缘时向内收，避免菜单被裁掉
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(x, window.innerWidth - r.width - 8),
      y: Math.min(y, window.innerHeight - r.height - 8)
    });
  }, [x, y]);

  useEffect(() => {
    const onDown = () => onClose();
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onClose]);

  return (
    <div
      className="ctx-menu"
      ref={ref}
      style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
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
    </div>
  );
}
