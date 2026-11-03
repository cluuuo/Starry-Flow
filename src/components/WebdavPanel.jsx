import React, { useEffect, useState } from 'react';

// 云备份：把完整快照上传到用户自己的 WebDAV 网盘，换机后从这里恢复
export default function WebdavPanel({ onRestored }) {
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [listOpen, setListOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [pending, setPending] = useState(null);
  const [restoring, setRestoring] = useState(false);

  const api = window.api;
  const available = Boolean(api && api.testWebdav);

  useEffect(() => {
    if (!available) return undefined;
    let alive = true;
    api.getWebdavConfig().then((cfg) => {
      if (!alive || !cfg) return;
      setUrl(cfg.url || '');
      setUsername(cfg.username || '');
      setHasPassword(Boolean(cfg.hasPassword));
    }).catch(() => { /* 读取失败时留空 */ });
    return () => { alive = false; };
  }, [available]);

  const payload = () => ({ url, username, password });
  const fail = (text) => setMsg({ ok: false, text: text || '操作失败' });

  const handleTest = async () => {
    setBusy('test');
    setMsg(null);
    const res = await api.testWebdav(payload());
    setBusy('');
    if (res && res.ok) {
      setHasPassword(true);
      setPassword('');
      setMsg({ ok: true, text: res.message || '连接成功' });
    } else {
      fail((res && res.error) || '连接失败');
    }
  };

  const handleUpload = async () => {
    setBusy('upload');
    setMsg(null);
    const res = await api.uploadWebdav(payload());
    setBusy('');
    if (res && res.ok) {
      setHasPassword(true);
      setPassword('');
      setMsg({ ok: true, text: res.message || '已上传' });
    } else {
      fail((res && res.error) || '上传失败');
    }
  };

  const handleOpenList = async () => {
    setBusy('list');
    setMsg(null);
    const res = await api.listWebdav(payload());
    setBusy('');
    if (res && res.ok) {
      setHasPassword(true);
      setPassword('');
      setItems(res.items || []);
      setPending(null);
      setListOpen(true);
    } else {
      fail((res && res.error) || '读取云端备份失败');
    }
  };

  const handleRestore = async () => {
    if (!pending) return;
    setRestoring(true);
    const res = await api.restoreWebdav(pending);
    setRestoring(false);
    if (!res || !res.ok) {
      fail((res && res.error) || '恢复失败');
      return;
    }
    setListOpen(false);
    setPending(null);
    setMsg({
      ok: true,
      text: `已从云端恢复 ${res.summary?.days || 0} 天记录、已结算积分 ${res.summary?.cumulative ?? 0}${res.summary?.images ? `、印痕图片 ${res.summary.images} 张` : ''}。`
    });
    if (onRestored) await onRestored(res);
  };

  const formatMeta = (item) => {
    const parts = [];
    if (item.size) parts.push(`${(item.size / 1024 / 1024).toFixed(2)} MB`);
    if (item.modified) {
      const d = new Date(item.modified);
      if (!Number.isNaN(d.getTime())) parts.push(d.toLocaleString());
    }
    return parts.length ? parts.join(' · ') : '—';
  };

  return (
    <div className="settings-section settings-wide">
      <div className="settings-title">云备份 · WebDAV</div>
      <p className="settings-desc">
        把完整备份上传到自己的 WebDAV 网盘（如坚果云），换机或重装后再从这里恢复。
        坚果云请在「账户信息 › 安全选项」中生成应用密码，不要填登录密码。
        地址只填到 WebDAV 根目录即可，备份会统一放在其下的 StarryFlow 文件夹；若地址里已经写了文件夹，则直接存到该文件夹。
      </p>

      {!available ? (
        <div className="backup-msg fail">云备份仅在桌面应用中可用。</div>
      ) : (
        <>
          <div className="webdav-form">
            <div className="webdav-row">
              <label>WebDAV 地址</label>
              <input
                className="webdav-input"
                placeholder="https://dav.jianguoyun.com/dav/"
                spellCheck={false}
                value={url}
                onChange={(e) => { setUrl(e.target.value); setMsg(null); }}
              />
            </div>
            <div className="webdav-row">
              <label>账号</label>
              <input
                className="webdav-input"
                placeholder="坚果云账号（邮箱）"
                spellCheck={false}
                value={username}
                onChange={(e) => { setUsername(e.target.value); setMsg(null); }}
              />
            </div>
            <div className="webdav-row">
              <label>密码</label>
              <input
                type="password"
                className="webdav-input"
                placeholder={hasPassword ? '已保存，留空则保持不变' : '应用密码'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setMsg(null); }}
              />
            </div>
          </div>

          <div className="backup-buttons">
            <button className="settings-action" disabled={Boolean(busy)} onClick={handleTest}>
              {busy === 'test' ? '测试中…' : '测试连接'}
            </button>
            <button className="settings-action" disabled={Boolean(busy)} onClick={handleUpload}>
              {busy === 'upload' ? '上传中…' : '上传当前数据'}
            </button>
            <button className="settings-action" disabled={Boolean(busy)} onClick={handleOpenList}>
              {busy === 'list' ? '读取中…' : '从云端恢复'}
            </button>
          </div>

          {msg && <div className={`backup-msg ${msg.ok ? 'ok' : 'fail'}`}>{msg.text}</div>}
        </>
      )}

      {listOpen && (
        <div className="settings-mask" onMouseDown={() => setListOpen(false)}>
          <div className="dialog-window webdav-window" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dialog-head">
              <div>
                <div className="dialog-title">云端备份</div>
                <div className="dialog-sub">选择一份备份恢复到本机，会整体替换当前数据</div>
              </div>
              <button className="settings-close" onClick={() => setListOpen(false)} aria-label="关闭云端备份">×</button>
            </div>

            <div className="dialog-body">
              {items.length === 0 ? (
                <div className="webdav-empty">云端还没有备份文件，先上传一次吧。</div>
              ) : (
                <div className="webdav-list">
                  {items.map((item) => (
                    <div className={`webdav-item ${pending === item.name ? 'on' : ''}`} key={item.name}>
                      <div className="webdav-item-main">
                        <div className="webdav-item-name">{item.name}</div>
                        <div className="webdav-item-meta">{formatMeta(item)}</div>
                      </div>
                      <button
                        className="settings-action settings-action-inline"
                        onClick={() => setPending(item.name)}
                      >
                        {pending === item.name ? '已选择' : '选择'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {pending && (
                <p className="webdav-warn">恢复会覆盖本机的积分、设置、印痕与成就，且无法撤销。</p>
              )}
            </div>

            <div className="dialog-foot">
              <span className="dialog-spacer" />
              <button className="dialog-btn" onClick={() => setListOpen(false)}>取消</button>
              <button
                className="dialog-btn primary"
                disabled={!pending || restoring}
                onClick={handleRestore}
              >
                {restoring ? '恢复中…' : '恢复选中备份'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
