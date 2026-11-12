# Starry Flow 星流

> 把专注绘成星空的 Windows 专注记录应用。

你努力的每一天，都会在夜空里点亮一颗星。看得见的进度，才留得住长久的坚持。

![星图界面](starry-flow-deck/assets/ui/star-card.png)

## 功能

- **星图记录**：一天一颗星，亮度对应积分档位；点击已点亮的星点可以刻下印痕（文字或图片），悬浮查看当天积分、档位与契约目标。
- **星辉契约**：为某一天立下积分目标。立下后不能取消，目标只能上调；达成有额外奖励，失约产生赤字。
- **深空契约**：设定休息时段，到点降低积分速度，提醒自己按时收工。
- **三档显示**：经典、极简、迷你浮窗。迷你窗的底色、尺寸、阴影可在外观设置里调整，并支持实时预览。
- **随心额度**：积分按比例兑换成奖励额度，支持一键全部兑换；额度名称可自定义。
- **成就展厅**：纪念章按累计次数发放，悬停即可查看获得条件与上次获得时间。
- **WebDAV 云备份**：备份与恢复全部数据，可选择不备份印痕图片以节省流量。

## 界面

![专注卡](starry-flow-deck/assets/ui/focus-panel.png)

## 技术栈

- Electron 33 + React 18 + Vite 5
- Python 采集端（psutil + pywin32），负责前台进程与专注时长采集
- 数据本地优先，WebDAV 只连接你自己配置的服务器

## 本地开发

```bash
npm install
npm run dev
```

## 打包

```bash
npm run dist
```

安装包输出到 `release/` 目录。

## 下载

前往 [Releases](https://github.com/cluuuo/Starry-Flow/releases/latest) 下载最新安装包。

## 数据与隐私

- 专注数据、设置与印痕都保存在本机 `%LOCALAPPDATA%\StarryFlow`。
- 不包含任何统计上报；云备份只会发送到你填写的 WebDAV 地址。
- WebDAV 密码使用系统安全存储加密。

## 许可

[MIT License](LICENSE)
