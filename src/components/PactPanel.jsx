import React, { useEffect, useState } from 'react';

// 对赌协议：点击今天或未来日期的星点后，为那一天设定积分目标
export default function PactPanel({
  open,
  dateKey,
  todayKey,
  pacts = {},
  ratio = 80,
  reward = 100,
  onSave,
  onCancel,
  onClose
}) {
  const [date, setDate] = useState(dateKey || '');
  const [goal, setGoal] = useState('');
  const [error, setError] = useState('');

  const existing = dateKey && pacts[dateKey] && pacts[dateKey].status === 'pending' ? pacts[dateKey] : null;
  const minDate = todayKey || '';

  useEffect(() => {
    if (!open) return;
    setDate(dateKey || '');
    setGoal(existing ? String(existing.goal) : '');
    setError('');
  }, [open, dateKey]);

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
    const target = Number(goal);
    if (!date || date < minDate) {
      setError('请选择今天或之后的日期。');
      return;
    }
    if (!Number.isFinite(target) || target <= 0) {
      setError('请输入大于 0 的计划积分。');
      return;
    }
    onSave({
      date,
      goal: Math.round(target),
      oldDate: existing ? dateKey : null
    });
  };

  return (
    <div className="settings-mask" onMouseDown={onClose}>
      <div className="dialog-window pact-window" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <div>
            <div className="dialog-title">对赌协议</div>
            <div className="dialog-sub">
              达到目标的 {ratio}% 才算没有失约，达成后额外奖励 {reward}%
            </div>
          </div>
          <button className="settings-close" onClick={onClose} aria-label="关闭对赌设置">×</button>
        </div>

        <div className="dialog-body">
          <div className="dialog-field">
            <label>计划日期</label>
            <input
              type="date"
              min={minDate}
              value={date}
              onChange={(e) => { setDate(e.target.value); setError(''); }}
            />
          </div>
          <div className="dialog-field">
            <label>计划积分</label>
            <input
              type="number"
              min={1}
              step={100}
              placeholder="例如 10000"
              value={goal}
              onChange={(e) => { setGoal(e.target.value); setError(''); }}
            />
          </div>
          <p className="dialog-note">
            {existing
              ? `这一天已立下目标 ${existing.goal.toLocaleString()} 积分，保存会覆盖原计划。`
              : date === todayKey
                ? `今天立约：累计达到目标的 ${ratio}% 就不会产生赤字；达成 100% 会立即额外奖励目标的 ${reward}%。`
                : `当天累计达到 ${ratio}% 即不产生赤字；达到 100% 会再奖励目标的 ${reward}%。`}
          </p>
          {error && <p className="dialog-error">{error}</p>}
        </div>

        <div className="dialog-foot">
          {existing && (
            <button className="dialog-btn danger" onClick={() => onCancel(dateKey)}>
              取消对赌
            </button>
          )}
          <span className="dialog-spacer" />
          <button className="dialog-btn" onClick={onClose}>返回</button>
          <button className="dialog-btn primary" onClick={submit}>
            {existing ? '保存修改' : '立下对赌'}
          </button>
        </div>
      </div>
    </div>
  );
}
