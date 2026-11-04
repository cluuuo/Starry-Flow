import React, { useEffect, useState } from 'react';

const STATUS_TEXT = {
  pending: '进行中',
  done: '已达成',
  partial: '未达目标（未产生赤字）',
  failed: '未达成'
};

// 对赌协议：点击今天或未来日期的星点后，为那一天设定积分目标；立下后不可取消
export default function PactPanel({
  open,
  dateKey,
  todayKey,
  pacts = {},
  ratio = 80,
  reward = 100,
  onSave,
  onClose
}) {
  const [date, setDate] = useState(dateKey || '');
  const [goal, setGoal] = useState('');
  const [error, setError] = useState('');

  const record = dateKey && pacts[dateKey] ? pacts[dateKey] : null;
  const editable = Boolean(record && record.status === 'pending');
  const closed = Boolean(record && record.status !== 'pending');
  const minDate = todayKey || '';
  // 已立下的对赌只能往上加，不能删除也不能降低
  const oldGoal = record ? Math.max(0, Math.round(Number(record.goal) || 0)) : 0;
  const minGoal = record ? oldGoal + 1 : 1;

  useEffect(() => {
    if (!open) return;
    setDate(dateKey || '');
    setGoal(record ? String(record.goal) : '');
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
    if (record && Math.round(target) <= oldGoal) {
      setError(`星辉契约目标只能提高，当前已是 ${oldGoal.toLocaleString()} 积分。`);
      return;
    }
    onSave({ date, goal: Math.round(target) });
  };

  return (
    <div className="settings-mask" onMouseDown={onClose}>
      <div className="dialog-window pact-window" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <div>
            <div className="dialog-title">星辉契约</div>
            <div className="dialog-sub">
              达到目标的 {ratio}% 才算没有失约，达成后额外奖励 {reward}%
            </div>
          </div>
          <button className="settings-close" onClick={onClose} aria-label="关闭星辉契约设置">×</button>
        </div>

        <div className="dialog-body">
          <div className="dialog-field">
            <label>计划日期</label>
            <input
              type="date"
              min={minDate}
              value={date}
              disabled={Boolean(record)}
              onChange={(e) => { setDate(e.target.value); setError(''); }}
            />
          </div>
          <div className="dialog-field">
            <label>计划积分</label>
            <input
              type="number"
              min={minGoal}
              step={100}
              placeholder="例如 10000"
              value={goal}
              disabled={closed}
              onChange={(e) => { setGoal(e.target.value); setError(''); }}
            />
          </div>
          <p className="dialog-note">
            {closed
              ? `当日星辉契约${STATUS_TEXT[record.status] || '已结束'}，目标 ${record.goal.toLocaleString()} 积分${record.bonus ? `，奖励 ${record.bonus.toLocaleString()} 积分` : ''}。`
              : editable
                ? `这一天已立下目标 ${oldGoal.toLocaleString()} 积分，只能上调、不能降低；星辉契约一旦立下不可取消。`
                : date === todayKey
                  ? `今天立下星辉契约：累计达到目标的 ${ratio}% 就不会产生赤字；达成 100% 会立即额外奖励目标的 ${reward}%。`
                  : `当天累计达到 ${ratio}% 即不产生赤字；达到 100% 会再奖励目标的 ${reward}%。`}
          </p>
          {error && <p className="dialog-error">{error}</p>}
        </div>

        <div className="dialog-foot">
          <span className="dialog-spacer" />
          <button className="dialog-btn" onClick={onClose}>返回</button>
          {!closed && (
            <button className="dialog-btn primary" onClick={submit}>
              {record ? '保存修改' : '签订星辉契约'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
