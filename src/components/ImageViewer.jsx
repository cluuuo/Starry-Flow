import React, { useEffect, useRef, useState } from 'react';
import ContextMenu from './ContextMenu';

// 印痕大图查看器：滚轮缩放、拖动平移、右键菜单另存为、Esc 关闭
export default function ImageViewer({ src, onClose, onSaveAs }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [menu, setMenu] = useState(null);
  const stageRef = useRef(null);
  const drag = useRef(null);

  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const px = e.clientX - rect.left - rect.width / 2;
      const py = e.clientY - rect.top - rect.height / 2;
      setScale((prev) => {
        const next = Math.max(0.3, Math.min(5, prev * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        setOffset((o) => ({
          x: px - (px - o.x) * (next / prev),
          y: py - (py - o.y) * (next / prev)
        }));
        return next;
      });
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);

  // 用捕获阶段拦下 Esc：菜单打开时先关菜单，否则关闭查看器，避免连带关闭外层印痕面板
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (menu) {
        setMenu(null);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [menu, onClose]);

  const handleMaskClick = () => {
    if (menu) {
      setMenu(null);
      return;
    }
    onClose();
  };

  const startDrag = (e) => {
    e.preventDefault();
    drag.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveDrag = (e) => {
    if (!drag.current) return;
    setOffset({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
  };

  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div
      className="viewer-mask"
      onClick={handleMaskClick}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div className="viewer-stage" ref={stageRef}>
        <img
          className="viewer-image"
          src={src}
          alt="印痕大图"
          draggable={false}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={(e) => e.stopPropagation()}
        />
      </div>

      <div className="viewer-bar" onClick={(e) => e.stopPropagation()}>
        <span className="viewer-hint">滚轮缩放 · 拖动平移 · 右键另存为</span>
        <span className="viewer-scale">{Math.round(scale * 100)}%</span>
        <button className="viewer-btn" onClick={reset}>适应窗口</button>
        <button className="viewer-close" onClick={onClose}>×</button>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: '另存为', onClick: () => onSaveAs && onSaveAs() },
            { label: '适应窗口', onClick: reset },
            { label: '关闭查看', onClick: onClose }
          ]}
        />
      )}
    </div>
  );
}
