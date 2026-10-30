import React, { useEffect, useRef, useState } from 'react';
import { parseDateKey, tierIndex, tierHex, tierBrightness } from '../lib/logic';
import ImageViewer from './ImageViewer';
import ContextMenu from './ContextMenu';

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const MAX_TEXT = 600;

function formatDate(key) {
  const d = parseDateKey(key);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${WEEK[d.getDay()]}`;
}

// 选图后先压到合适尺寸，避免把原图整张存进磁盘
function compressImage(file, maxSize = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('图片读取失败'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

export default function MarkPanel({
  dateKey,
  points,
  mark,
  tiers,
  starColor,
  isToday,
  onSave,
  onDelete,
  onClose,
  readImage
}) {
  const [text, setText] = useState(mark?.text || '');
  const [newDataUrl, setNewDataUrl] = useState(null);
  const [removed, setRemoved] = useState(false);
  const [savedUrl, setSavedUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [menu, setMenu] = useState(null);
  const fileRef = useRef(null);

  const level = tierIndex(points, tiers);
  const tier = level >= 0 ? tiers[level] : null;

  // 重新打开或切换到另一天时重置草稿
  useEffect(() => {
    setText(mark?.text || '');
    setNewDataUrl(null);
    setRemoved(false);
    setBusy(false);
  }, [dateKey, mark]);

  // 已落盘的图片按需读回
  useEffect(() => {
    let alive = true;
    if (!mark || removed || newDataUrl) {
      setSavedUrl(null);
      return () => { alive = false; };
    }
    if (mark.imageData) {
      setSavedUrl(mark.imageData);
    } else if (mark.image && readImage) {
      readImage(mark.image).then((url) => { if (alive) setSavedUrl(url); });
    } else {
      setSavedUrl(null);
    }
    return () => { alive = false; };
  }, [mark, removed, newDataUrl, readImage]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (menu) {
        setMenu(null);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, onClose]);

  const imgSrc = newDataUrl || savedUrl;
  const hasMark = Boolean(mark && (mark.text || mark.image || mark.imageData));
  const dirty =
    text !== (mark?.text || '') || Boolean(newDataUrl) || removed;

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      setNewDataUrl(dataUrl);
      setRemoved(false);
    } catch (err) {
      /* 读取失败时保持原状 */
    }
  };

  const removeImage = () => {
    setNewDataUrl(null);
    setSavedUrl(null);
    setRemoved(true);
  };

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    await onSave({ text: text.trim(), newDataUrl, removed });
    setBusy(false);
    onClose();
  };

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true);
    await onDelete();
    setBusy(false);
    onClose();
  };

  // 另存为：已落盘的图片直接复制原文件，新图按 dataURL 写出
  const saveAs = async () => {
    if (!imgSrc) return;
    const file = !newDataUrl && mark?.image ? mark.image : null;
    if (window.api && window.api.saveMarkImageAs) {
      await window.api.saveMarkImageAs({ file, dataUrl: imgSrc });
      return;
    }
    const a = document.createElement('a');
    a.href = imgSrc;
    a.download = `印痕-${dateKey}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const blockContextMenu = (e) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const handleMaskClick = () => {
    if (menu) {
      setMenu(null);
      return;
    }
    onClose();
  };

  return (
    <>
      <div className="mark-mask" onClick={handleMaskClick}>
      <div className="mark-panel" onClick={(e) => e.stopPropagation()}>
        <div className="mark-head">
          <div>
            <div className="mark-date">{formatDate(dateKey)}</div>
            <div className="mark-meta">
              <span
                className="mark-tier-dot"
                style={
                  tier && {
                    backgroundColor: tierHex(starColor, level, tier),
                    filter: `brightness(${tierBrightness(tier, level)})`,
                    boxShadow: `0 0 8px ${tierHex(starColor, level, tier)}`
                  }
                }
              />
              {level >= 0 ? `L${level + 1}` : '未达签到线'}
              <span className="mark-points">{points.toLocaleString()} 积分</span>
              {isToday && <span className="mark-today">今天</span>}
            </div>
          </div>
          <button className="mark-close" onClick={onClose} aria-label="关闭">×</button>
        </div>

        <div className="mark-body">
          <label className="mark-label">这一天留下了什么</label>
          <textarea
            className="mark-text"
            value={text}
            maxLength={MAX_TEXT}
            placeholder="记录当天的感悟，或最有成就感的那件成果。"
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          <div className="mark-count">{text.length} / {MAX_TEXT}</div>

          {imgSrc ? (
            <>
              <div className="mark-image-wrap">
                <img
                  className="mark-image"
                  src={imgSrc}
                  alt="印痕图片"
                  title="双击查看大图 · 右键另存为"
                  onDoubleClick={() => setViewerOpen(true)}
                  onContextMenu={blockContextMenu}
                />
                <button className="mark-image-remove" onClick={removeImage}>移除图片</button>
              </div>
              <div className="mark-image-hint">双击查看大图 · 滚轮缩放 · 右键另存为</div>
            </>
          ) : (
            <button className="mark-image-add" onClick={() => fileRef.current && fileRef.current.click()}>
              <span className="mark-add-icon">+</span>
              <span className="mark-add-title">添加一张图片</span>
              <span className="mark-add-hint">把这一刻的样子留下来</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
        </div>

        <div className="mark-foot">
          {hasMark ? (
            <button className="mark-delete" onClick={handleDelete}>删除印痕</button>
          ) : (
            <span className="mark-foot-hint">只属于你的记录，仅保存在本机</span>
          )}
          <div className="mark-foot-right">
            <button className="mark-cancel" onClick={onClose}>取消</button>
            <button className="mark-save" onClick={handleSave} disabled={!dirty || busy}>保存</button>
          </div>
        </div>
      </div>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: '查看大图', onClick: () => setViewerOpen(true) },
            { label: '另存为', onClick: saveAs }
          ]}
        />
      )}

      {viewerOpen && imgSrc && (
        <ImageViewer src={imgSrc} onClose={() => setViewerOpen(false)} onSaveAs={saveAs} />
      )}
    </>
  );
}
