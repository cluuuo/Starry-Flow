import React, { useEffect, useState } from 'react';

// 赤字平账：从当日累计积分转入赤字账户，填平后消失
export default function DeficitPanel({ open, deficit = 0, available = 0, onPay, onClose }) {
  const maxPay = Math.max(0, Math.min(deficit, available));
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setAmount(String(maxPay));
    setError('');
  }, [open, maxPay]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('请输入要偿还的积分。');
      return;
    }
    if (value > deficit) {
      setError(`赤字只有 ${deficit.toLocaleString()}，不需要偿还这么多。`);
      return;
    }
    if (value > available) {
      setError(`当日累计只有 ${available.toLocaleString()}，不够偿还。`);
      return;
    }
    onPay(Math.round(value));
  };

  return (
    <div className="settings-mask" onMouseDown={onClose}>
      <div className="dialog-window deficit-window" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <div>
            <div className="dialog-title">平账</div>
            <div className="dialog-sub">用当日累计积分偿还赤字，两个账户同时减少</div>
          </div>
          <button className="settings-close" onClick={onClose} aria-label="关闭平账">×</button>
        </div>

        <div className="dialog-body">
          <div className="deficit-summary">
            <span className="deficit-summary-label">当前赤字</span>
            <span className="deficit-summary-value">-{deficit.toLocaleString()}</span>
          </div>
          <div className="dialog-field">
            <label>偿还积分</label>
            <input
              type="number"
              min={1}
              max={maxPay}
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(''); }}
            />
          </div>
          <p className="dialog-note">
            当日可用于偿还的累计积分为 {available.toLocaleString()}，最多可偿还 {maxPay.toLocaleString()}。
          </p>
          {error && <p className="dialog-error">{error}</p>}
        </div>

        <div className="dialog-foot">
          <button className="dialog-btn" onClick={() => setAmount(String(maxPay))}>全部填平</button>
          <span className="dialog-spacer" />
          <button className="dialog-btn" onClick={onClose}>返回</button>
          <button className="dialog-btn primary" onClick={submit} disabled={maxPay <= 0}>
            确认偿还
          </button>
        </div>
      </div>
    </div>
  );
}
