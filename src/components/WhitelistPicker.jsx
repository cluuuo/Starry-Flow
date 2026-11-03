import React, { useEffect, useMemo, useState } from 'react';

const MAX_ITEMS = 5;

function keyOf(item) {
  if (!item) return '';
  if (item.self) return '__self__';
  return (item.path || `name:${item.name || ''}`).toLowerCase();
}

// 特殊白名单进程选择：从当前可见进程里多选，最多 5 个，包含本软件自身
export default function WhitelistPicker({ open, processes = [], items = [], onSave, onClose }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(items.slice(0, MAX_ITEMS).map(keyOf));
    setError('');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const allOptions = useMemo(() => {
    const list = [{ key: '__self__', name: 'Starry Flow', title: '本软件', path: '', self: true }];
    const seen = new Set(['__self__']);
    processes.forEach((p) => {
      if (!p || !p.name) return;
      const key = (p.path || `name:${p.name}`).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      list.push({
        key,
        name: p.name,
        title: p.title || p.name,
        path: p.path || '',
        self: false
      });
    });
    return list;
  }, [processes]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter((p) => `${p.name} ${p.title}`.toLowerCase().includes(q));
  }, [allOptions, query]);

  if (!open) return null;

  const toggle = (option) => {
    if (selected.includes(option.key)) {
      setSelected(selected.filter((key) => key !== option.key));
      setError('');
      return;
    }
    if (selected.length >= MAX_ITEMS) {
      setError(`最多选择 ${MAX_ITEMS} 个进程`);
      return;
    }
    setSelected([...selected, option.key]);
    setError('');
  };

  const submit = () => {
    const optionMap = new Map(allOptions.map((o) => [o.key, o]));
    const oldMap = new Map(items.map((it) => [keyOf(it), it]));
    const next = selected
      .map((key) => {
        const option = optionMap.get(key);
        if (option) {
          return option.self
            ? { name: 'Starry Flow', path: '', self: true }
            : { name: option.name, path: option.path, self: false };
        }
        const old = oldMap.get(key);
        return old ? { name: old.name, path: old.path, self: !!old.self } : null;
      })
      .filter(Boolean);
    onSave(next);
  };

  return (
    <div className="picker-mask" onMouseDown={onClose}>
      <div className="picker-window whitelist-window" onMouseDown={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <span>选择白名单进程</span>
          <button className="picker-close" onClick={onClose} aria-label="关闭白名单选择">×</button>
        </div>

        <div className="picker-search-row">
          <input
            className="picker-search"
            autoFocus
            placeholder="搜索进程名称或窗口标题"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className={`whitelist-count ${selected.length >= MAX_ITEMS ? 'full' : ''}`}>
            已选 {selected.length} / {MAX_ITEMS}
          </span>
        </div>

        <div className="picker-list">
          {options.map((option) => {
            const checked = selected.includes(option.key);
            return (
              <button
                key={option.key}
                className={`picker-item ${checked ? 'on' : ''}`}
                onClick={() => toggle(option)}
              >
                <span className={`pick-box ${checked ? 'on' : ''}`}>{checked ? '✓' : ''}</span>
                <span className="picker-item-main">
                  <span className="picker-item-name">
                    {option.name}
                    {option.self && <span className="whitelist-self-tag">本软件</span>}
                  </span>
                  <span className="picker-item-title">{option.title}</span>
                </span>
              </button>
            );
          })}
          {!options.length && <div className="picker-empty">没有匹配的进程</div>}
        </div>

        {error && <div className="whitelist-error">{error}</div>}

        <div className="whitelist-foot">
          <button className="dialog-btn" onClick={onClose}>取消</button>
          <button className="dialog-btn primary" onClick={submit}>确定</button>
        </div>
      </div>
    </div>
  );
}
