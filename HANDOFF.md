# Starry Flow 星流 · 开发交接文档

> 供新对话/新开发者继续开发使用。最后更新：2026-11-03 · 当前版本 **2.12.0**

---

## 1. 项目定位

专注目标与进度可视化终端（Windows 桌面应用）。把每天的专注投入转化为夜空中的「星点」：当天专注积分越多，星点越亮。视觉参考 GitHub 贡献图的点阵逻辑，但重做成**夜空 + 星点 + 流星 + 卫星**的叙事化界面。

核心差异化：

1. **符合作息的「当日」判定** —— 不是零点换日，而是 07:00～次日 04:00 都算同一天（可自定义），解决"熬夜到凌晨 1 点画的画算哪一天"的问题。
2. **渐进解锁** —— 不一次性铺出整年空槽，按"1 天 → 3 天 → 一周 → 逐周递进"渐进展示，避免"前路漫漫"的心理压力。
3. **印痕** —— 已点亮的日期可点开写文字、传图片，记录当天感悟或成果，可回看；图片支持双击查看大图、滚轮缩放、右键菜单另存。

---

## 2. 当前状态

| 项目 | 状态 |
|---|---|
| 主视觉（星图 / 夜空 / 流星 / 卫星 / 印痕卫星） | 已完成并多轮迭代验收 |
| 专注信息模块（进程选择弹窗 / 积分 / 进度 / 严格模式 / 额度 / 按钮） | 已完成 |
| 设置窗口（外观设置 / 规则设置两类，区块卡片化，逐区块恢复默认） | 已完成 |
| 印痕（文字 + 图片 + 大图查看器 + 右键菜单另存） | 已完成并验证 |
| 专注模块（采集端 + 主界面控制） | 已接入，积分规则沿用 `F:\PROJECT FILES\python proj\focus` |
| 每日结算（结算登记星点 + 大数字清零 + 同日多轮专注） | 已完成并验证 |
| 数据记忆（上次专注进程 / 窗口位置与尺寸 / 设置分类） | 已完成并验证 |
| 数据调试（已结算积分与随心额度正负调整） | 已完成并验证 |
| 数据存储位置自定义（设置 › 备份与恢复） | 已完成并验证：积分/额度、印痕文字、印痕图片三项路径可查看与更改，重启生效；导入/导出备份已迁到该页 |
| 显示模式（经典 / 极简 / 迷你） | 已完成并验证：极简为可缩放竖屏面板（默认 424×704，圆环进度 + 中心星点与积分，面板内星空）；迷你为 220×200 透明置顶浮窗（星点 + 今日积分 + 严格模式呼吸光环）；三模式各自记忆位置与尺寸，重启恢复上次模式 |
| 多进程工作组 | 已完成并验证：最多两个进程同时监控，命中任一即专注；选择列表含工作组 / 常用 / 全部进程三段，工作组数量 3~7 可调；本软件白名单开关（严格模式也暂停不倒扣） |
| 特殊白名单 | 已完成：规则设置内最多选 5 个进程（可含本软件），焦点落在这些软件上不算偏离、继续积分但按普通/严格模式各自的设定速度降速 |
| 成就系统 | 功能已完成：条件达成自动获得纪念章、同一成就可反复获得、纪念章累计数量持久化；右下角「成就展厅」入口弹出展示窗口，含锥形打光纪念章。纪念章已用 SVG 绘制 8 种图形 |
| 心理学模型 | 已完成：设置新增「心理学模型」页，含健康就寝（到点降速、就寝结算得纪念章）与对赌协议（未来星点设目标、达标奖励 + 礼花、未达比例产生赤字、平账得纪念章） |
| 打包 | setup 安装版产出到 `release/`；2.8.1 已产出 `Starry Flow Setup 2.8.1.exe`（98.67MB，内置 monitor.exe 8.1MB，未签名）；2.8.0 及更早旧包同目录保留；portable 未生成 |
| 交付前文案审查 | 部分完成（星点引导文案已按用户意见改写，仍需全量复查） |

**未发布改动（工作区）**

- 标题右侧显示版本号：`Starry Flow` 后跟小字 `v2.12.0`（11px、淡色、60% 透明度，极简模式 10px）；数值来自主进程 `app.getVersion()`（`app:version` IPC），每次升版后界面自动同步，不需要改界面代码。

**2.12.0 版本要点（本轮迭代汇总）**

- 设置 › 规则 › 特殊白名单：`settings.specialWhitelist = { enabled, normalSpeed, strictSpeed, items }`，`items` 最多 5 个（`{ name, path, self }`），可按路径去重、允许包含本软件自身；`mergeSettings` 负责清洗与截断。
- 选择弹窗 `WhitelistPicker.jsx`：列出本软件与当前可见进程，支持搜索、多选、已选 N/5，超出 5 个给出提示；选中项在设置页以胶囊展示，可单个移除。
- 采集端每 5 秒刷新配置；`in_special_whitelist(fg_pid, cfg)` 命中规则：白名单含 `self` 时走 `is_self_window()`，其余按可执行路径（`os.path.normcase`）与前台进程比对。
- 命中白名单时：不算偏离、不扣分，积分照常按秒累积，但速度固定为普通模式 `normalSpeed`（默认 2）或严格模式 `strictSpeed`（默认 3）；`focus-data.special_active` 供面板显示「特殊白名单」标签。
- 优先级：专注进程命中 → 正常速度；`selfWhitelist`（本软件白名单，暂停不计分）优先于特殊白名单；特殊白名单再于偏离判定之前；顺序之外的焦点仍按原规则判定偏离。
- 版本管理：package.json / package-lock.json 版本号 2.12.0。

**2.11.0 版本要点（本轮迭代汇总）**

- 设置新增「心理学模型」页（`settingsTab: 'psychology'`），配置保存在 `settings.json` 的 `psychology` 字段，`mergeSettings` 负责范围与步进校验。
- 德西效应 · 健康就寝：`psychology.healthySleep = { enabled, bedtimeMinutes, normalSpeed, strictSpeed }`。采集端每 5 秒刷新配置，到达就寝时间后普通/严格模式的每秒积分改为设定值（`effective_speed()`），`focus-data` 的 `sleep_active` 供界面显示「就寝时段」；在就寝时段内点击结算，`counters.sleep_settles += 1`，对应「乖乖睡觉」纪念章。
- 损失厌恶效应 · 对赌协议：`psychology.pact = { enabled, ratio（50~100 步进 5）, reward（50~150 步进 5） }`。开启后星图上未来未点亮的星点可点击，弹出 `PactPanel` 设定日期与计划积分，指令 `set_pact` / `cancel_pact`，数据存 `focus-data.json` 的 `pacts`（按日期，含 goal/ratio/reward/status/bonus 快照）。
- 对赌判定（`evaluate_pacts()`，主循环每 0.5 秒）：当天累计（days + settled）≥ 目标时立即发放 `goal × reward%` 奖励并写回当天累计，`status=done`，`counters.pact_success += 1`，notice 带 `celebrate`；日期过去后仍未达 `goal × ratio%` 则 `deficit += goal`、`status=failed`；达到比例但未到目标记 `partial`（不奖不罚）。
- 赤字与平账：`focus-data.json` 的 `deficit` 为待偿还总额；专注面板「当前积分」同一行最右侧显示红色发光负数（点击打开 `DeficitPanel`），指令 `pay_deficit` 从当日累计（先未结算 days、后 settled）扣除并等额减少赤字，settled 扣减同步 `cumulative_points` 与 `history`；赤字归零时 `counters.deficit_cleared += 1`，对应「平账大师」纪念章。
- 全屏礼花：`Celebration.jsx` 用 canvas 绘制三组爆点，颜色取当前 `--accent`，持续约 3 秒；前端轮询 notice 的 `celebrate` 字段触发。
- 成就扩展：新增「乖乖睡觉（moon）」「平账大师（scale）」「对赌成功（pact）」，判定数据来自 `focus.counters`；8 个成就的纪念章图形在 `AchievementHall.jsx` 的 `MedalArt` 中用 SVG 绘制（星、光点、轨道、河流、光芒、月牙、天平、盾牌对勾）。
- 版本管理：package.json / package-lock.json 版本号 2.11.0。

**2.10.0 版本要点（成就系统首版）**

- 成就系统：新增 `src/lib/achievements.js`，成就条目集中在 `ACHIEVEMENTS` 表（名称、说明、`metric(ctx)` 累计达成次数）。每次按全部历史重算目标次数，只增不减，因此同一成就可以反复获得（如积分池每满一万加一枚），存档可幂等回算。
- 判定口径：有效日（达到 L1 阈值的日期数）、当前连续签到、总获积分池、单日达到最高档的天数；数据来自 `displayDays`（含已结算与本轮），不受旅程起始日裁剪。
- 数据存档：`%LOCALAPPDATA%\StarryFlow\achievements.json`，结构 `{ version: 1, unlocked: { [id]: { count, firstAt, lastAt } } }`；主进程新增 `achievements:get` / `achievements:set`，并纳入备份导出与导入（旧备份没有该字段时不清空已有存档）。
- 入口：统计栏由 4 列改为 5 列，第五张与「总获积分池 / 连续签到 / 有效天数 / 单日最高」同尺寸，显示已获总枚数与「成就展厅」，点击弹出展厅。
- 展厅：`AchievementHall.jsx`，`min(1040px, 94vw)` × 88vh 大窗口，沿用设置窗口的遮罩、卡片底色与弹出动画；网格展示已获得的纪念章，按数量降序，标题区显示「已收集 N 种 · 共 M 枚纪念章」，Esc 或点击遮罩关闭。
- 纪念章：占位视觉（无美术资产），圆盘 + 虚线内圈 + 四芒星，全部使用 `var(--accent)` 与 `color-mix` 派生，随主题色实时变化；徽章上方为锥形光柱（窄顶宽底、由上向下渐隐），下方为地面光晕，名称与获得数量排在徽章下方；卡片入场有 55ms 错峰动画与悬停抬升。
- 新获得纪念章会复用底部 toast 提示（`获得成就纪念章 · 名称（N 枚）`）；首次加载只补算历史并静默落盘，不刷提示。

**2.9.1 版本要点（本轮迭代汇总）**

- 多进程工作组：进程监视由单选改为最多两个进程，焦点命中任一选中进程即视为专注（`monitor.py` 主循环用 `selected_ids` 集合判定）；旧存档的 `selected_pid` 在 `load_data()` 中自动迁移为 `selected_pids`，同时保留旧字段供兼容。
- 选择弹窗重做：顶部「工作组」（双进程历史，点击直接勾选并应用）、其下「常用」（单进程历史，胶囊按钮）、最后「全部进程」带勾选框；已选 N/2 显示在底部，超出两个时挤出最早勾选的进程。
- 选择历史：`settings.json` 新增 `processHistory: { groups: [{ paths, names, count }], singles: [{ path, name, count }] }`，以可执行路径为键，按使用次数降序；`App.jsx` 的 `recordProcessHistory()` 在应用选择时写入，`logic.js` 的 `normalizeProcessHistory()` 负责校验与迁移。
- 工作组数量：设置 › 规则 › 进程监控可调 3~7（`maxWorkGroups`，默认 3），决定选择列表展示的工作组条数；历史文件内部最多保留 20 条。
- 双进程显示：专注面板与极简面板的图标框横向展开为两块（`.focus-app-icon.multi`），名称用 ` + ` 连接，副标题显示「2 个进程 · 状态」。
- 本软件白名单：设置 › 规则新增「将本软件列为默认白名单」（`selfWhitelist`），采集端每 5 秒从 `settings.json` 刷新；开启后焦点落在星流（主进程或其子进程，`is_self_window()`）时不算偏离，普通模式暂停加分、严格模式同样暂停且不倒扣，界面显示「已切换到星流，计时暂停」。
- 进程弹窗改用 `createPortal` 挂到 `body`：极简面板的 `.focus-panel-compact > * { position: relative }` 会把 `fixed` 遮罩拖进面板内部，导致弹窗溢出到页面下方。
- 版本管理：package.json / package-lock.json 版本号 2.9.1。

**2.8.1 版本要点（本轮迭代汇总）**

- 积分术语区分：专注面板改为「本日累计」（值 = 今日已结算 `settled[today]` + 本轮实时积分），显示在面板底部左侧、随心额度紧随其后，两块共用同一套字体配置（12px 标签 + 24px 主题色数值 + 12px 单位）；数据统计的全局求和值改为「总获积分池」；设置页兑换/调试与采集端通知统一为「已结算积分」（`cumulative_points`）。三个数值口径各归其名，不再共用「累计积分」。
- 版本管理：package.json / package-lock.json 版本号 2.8.1。

**2.8.0 版本要点（本轮迭代汇总）**

- 三显示模式：经典（原界面）、极简（可缩放的竖屏面板，默认 424×704）、迷你（220×200 透明置顶浮窗）。
- 极简模式布局：标题栏单行、模式按钮靠右且不显示设置按钮；主体为圆环进度，圆环中心上方是大号星点、下方是今日积分；「开始专注」「每日结算」在圆环下方；隐藏随心额度、「当前积分」、「还差/再得」「当前速度」；严格模式开启时照常显示「结算门槛」。
- 极简模式氛围：面板内复用经典星图的 `SkyBackdrop`（密度/流速/动态开关全部沿用设置）与 `MeteorLayer`；中心星点复用 `starMotionStyle()` 的漂浮动效（方向/幅度/周期与经典一致）；失去焦点的红色提示居中。
- 提示统一为窗口底部 toast：`Toast` 组件 + CSS `toast-in-out` 动画（淡入 → 停留约 3 秒 → 淡出），取代 FocusPanel 顶部通知条；极简模式 toast 上移到操作按钮上方，避免遮挡。
- 极简模式可缩放并记忆尺寸（最小 360×560），尺寸与坐标写入 `compact: {x,y,width,height}`。
- 迷你模式配色：星点与数字都直接使用主题色与当前档位色（**不再用 brightness 压暗**，避免发灰发脏），阶段差异只通过光晕强度体现；数字 32px，用两层暗影 + 同色辉光保证任意壁纸可读；设置每 2s 刷新一次，跟随主题色调整。
- 切换入口：经典与极简标题栏里设置按钮右侧依次是两个模式按钮（极简模式不显示设置按钮）；迷你窗口左键单击切到极简、按住拖动、右键也可切回。
- 窗口实现：主窗口承载经典与极简（`setBounds` + 最小尺寸切换），迷你模式用独立 `BrowserWindow`（`transparent`、`alwaysOnTop: 'floating'`、`skipTaskbar`、无阴影），页面通过 `?mode=mini` 渲染 `MiniApp`。
- 位置记忆：`window-state.json` 为 `{ mode, mainMode, classic:{x,y,width,height,maximized}, compact:{x,y,width,height}, mini:{x,y} }`，向下兼容旧格式；重启按 `mode` 恢复（迷你模式只显示迷你窗）。
- 迷你拖动：渲染层区分「点击 / 拖动」（位移 > 4px 视为拖动），主进程用 `screen.getCursorScreenPoint()` 计算偏移并 `setPosition`，拖动结束后落盘。
- 版本管理：package.json / package-lock.json 版本号 2.8.0。

**2.7.0 版本要点**

- 设置窗口新增第三页「备份与恢复」：展示积分/额度（`focus-data.json`）、印痕文字（`marks.json`）、印痕图片（图片文件夹）当前路径，可各自「打开路径」「更改位置」或「恢复默认」；原来的导入/导出备份从规则页迁移到该页。
- 「打开路径」走 `storage:open`：文件用 `shell.showItemInFolder` 在资源管理器中定位，图片文件夹用 `shell.openPath` 直接打开；路径刚改过尚未重启时也能打开目标目录（不存在则先创建）。
- 设置窗口尺寸平滑：内容包一层 `.settings-page`，`useLayoutEffect` + `ResizeObserver` 量出「页头 + 标签 + 页脚 + 内容」总高并写到窗口 inline `height`，CSS `transition: height 0.3s` 负责过渡；首次打开禁用过渡直接定位，`.settings-body` 加 `scrollbar-gutter: stable` 防止滚动条出现/消失导致文字重排抖动。
- 路径自定义实现：`%LOCALAPPDATA%\StarryFlow\storage.json` 记录 `focusDir` / `marksFileDir` / `marksImageDir` 三项覆盖值（留空即默认），作为引导配置避免自引用；主进程 `resolveStorage()` 统一解析，`settings.json` 与 `window-state.json` 始终留在默认目录。
- 更改路径时先把现有数据复制到新位置（`copyFileIfMissing` / `copyDirInto`，不覆盖目标同名文件），写入配置后提示「重启应用后生效」，可用「立即重启」调 `app:restart`（`app.relaunch()`）。
- 采集端跟随：`startMonitor()` 通过 `STARRY_FLOW_FOCUS_DIR` / `STARRY_FLOW_SETTINGS_FILE` 环境变量把自定义目录传给 Python；`monitor.py` 用 `BASE_DIR` 与 `DATA_DIR` 区分默认目录与数据目录，`atomic_write` 改为写入目标文件所在目录。
- 版本管理：package.json / package-lock.json 版本号 2.7.0。

**2.6.3 版本要点**

- 沉浸式标题栏：`BrowserWindow` 改为 `frame: false`，去掉系统标题栏；顶部固定拖拽条 + header 均可拖动窗口，右上角自绘三个窗口按钮（44×32，贴窗口右上角），经 `windowControl()` 调用主进程，最大化/还原图标随窗口状态切换；`backgroundColor` 与默认背景统一为 `#060e24`，消除启动闪色。
- 每轮调整：窗口按钮位置贴合经典 Windows 习惯；设置按钮通过 header `padding-top: 18px` / `margin-bottom: 10px` 下移，与窗口按钮留 20px、与专注卡片留 16px。
- 修复印痕卫星相位漂移：卫星改为渲染在 `.star` 内部，随父级同一份 `float-*` 动画移动；星点发光滤镜移到 `.star-svg`，避免影响卫星。运行中新建印痕的星点不再出现卫星独立运动。
- 版本管理：package.json / package-lock.json 版本号 2.6.3。

**2.6.1 版本要点**

- 新增「印痕环绕」设置（外观设置页）：环绕动效开关 + 5 档环绕速度，默认 3 档即原有 3800ms 周期；关闭后不跑 rAF，改为星点右下角固定光点，仍作为印痕标记。
- 卫星与星点曾通过 `starMotionStyle(dateKey, motion)` 各自复制同一组漂浮动画（**2.6.3 起改为子元素共享父级动画**，见 9.4 与第 10 节第 20 条）
- 文案统一：设置页与主界面「贡献」全部改为「积分」，「N 分」「分 / 秒」「分 / 次」等单位统一为「N 积分」「积分/秒」；「严格模式速度」改为「严格模式积分速度」。
- 动效开关：「启用漂浮 / 环绕动效 / 星空动态」改为「启用漂浮动效 / 启用环绕动效 / 启用动态星空效果」，开启时在标签右侧显示低可视度提示「开启后可能增加性能负载」。
- 视觉细节：时间选择器钟表图标反色适配深色背景；星点悬停气泡整体放大（13px 正文、17px 数值、11×15 内边距）；进度下方提示文案改为左对齐；兑换/花费行的额度名称与输入框拉开 10px。
- 版本管理：package.json / package-lock.json 版本号 2.6.1。

**2.4.0 版本要点**

- 专注模块交互：严格模式改为滑块开关，开关居右、提示文案居左；开关尺寸与「更换进程」按钮一致（78×34，滑块 24×24 圆角正方形），开启态轨道与滑块发光、关闭态无光晕。
- 文案：严格模式提示改为「离开进程不会扣除积分 / 离开进程会持续扣除积分」，不再显示具体扣分数值。
- 视觉：严格模式积分数字背后的流星改为自左向右飞行，尾迹拖在左侧，其余参数不变。
- 布局：「开始专注」与「每日结算」统一为同一尺寸（114×44），「每日结算」右边缘与严格模式开关右边缘对齐。
- 移除：设置「规则设置」页的「新的旅程 · 从今天重新开始」区块已删除（该入口会把起始日重置为今天，等于清空已积累的成绩，存在误删风险）；`settings.startDate` 仅保留读取，用于计算旅程天数与统计范围。
- 版本管理：package.json / package-lock.json 版本号 2.4.0，本地 git 打 tag `v2.4.0`。

**2.3.0 版本要点**

- 界面：专注信息模块重构为单卡片；设置由侧边抽屉改为居中窗口，分「外观设置 / 规则设置」；各区块圆角框线、左右等高、逐区块恢复默认。
- 视觉：背景色支持 HSV 自定义并派生整套界面底色；星点漂浮速度改 1–5 档、幅度上限 12px、随机轨迹 8 组；星空流动速度改 1–5 档并可整体关闭；卫星统一绝对时钟同步环绕；严格模式下积分数字背后有自右向左的流星特效。
- 状态：焦点脱离专注进程时积分数字变红发光，严格模式特效隐藏直至焦点恢复。
- 数据：结算改为「登记星点颜色 → 清空本轮积分 → 可同日多轮」；旧存档 `settlement_version` 一次性迁移；新增「数据调试」指令 `adjust_totals`。
- 记忆：采集端恢复上次选中的进程（PID + 进程名校验），主进程记忆窗口位置/尺寸/所在显示器/最大化状态，设置记忆停留的分类页。
- 性能：采集端指令扫描与状态刷新 0.5 秒一轮（积分仍按整秒结算），前端轮询 400ms，点击类操作使用乐观更新并防止旧状态闪回。
- 文案：星点阶段引导文案按用户意见重写（见 5.3）。
- 版本管理：package.json / package-lock.json 版本号 2.3.0，本地 git 打 tag `v2.3.0`。

**运行方式**（工作目录 `f:\VIBE CODING\BOX-TRAE\PROJ-contribution tab`）：

```
npm run dev           # Vite + Electron 开发，自动打开窗口
npx vite build        # 仅构建前端，用于快速验证编译
npm run build:monitor # PyInstaller 把 monitor.py 打成 monitor/dist/monitor.exe
npm run pack          # 构建 + 采集器 exe + 免安装目录（release/win-unpacked）
npm run dist          # 构建 + 采集器 exe + 安装包（nsis + portable）
```

**环境与依赖（本机实测）**

| 项目 | 版本 / 路径 | 说明 |
|---|---|---|
| Node / npm | 24.x / 11.x | npm 源已指向 `registry.npmmirror.com` |
| Python | 3.13.5 @ `F:\PYTHON\python.exe` | 未加入持久 PATH，主进程按固定路径兜底探测 |
| psutil / pywin32 / PyInstaller | 7.0.0 / 312 / 6.14.1 | 采集端运行与打包所需 |
| pip | 清华源 `pypi.tuna.tsinghua.edu.cn` | 已写入 pip 全局配置 |
| Electron / electron-builder | 33.4.11 / 25.1.8 | 打包缓存已含 nsis、winCodeSign |

**采集器启动策略**（`electron/main.js` 的 `startMonitor`）
- 开发模式：优先 `STARRY_FLOW_PYTHON` → `F:\PYTHON\python.exe` → `python` → `py` 跑 `monitor/monitor.py`，都失败再退回本地 `monitor/dist/monitor.exe`。
- 打包模式：优先 `resources/monitor/monitor.exe`（`extraResources` 注入，不依赖客户机 Python），失败再退回客户机 Python。
- 启动与退出记录写在 `%LOCALAPPDATA%\StarryFlow\boot.log`，排查"采集端未连接"先看该文件。

**打包路径注意**：`monitor.py` 不能放进 `app.asar`（Python 读不到），因此 `package.json` 用 `extraResources` 把 `monitor.exe` 与 `monitor.py` 放到 `resources/monitor/`，主进程按 `process.resourcesPath` 取值；`files` 里**不要**再写 `monitor/**/*`。

**测试打包产物时的坑**：用 Shell 的 `Start-Process` 启动 `release\win-unpacked\Starry Flow.exe`，命令结束后整个进程树会被回收，看起来像"应用启动十几秒自行退出"。验证请用 `Start-Process explorer.exe -ArgumentList '"<exe 路径>"'` 或直接双击。

**注意**：`dev` 脚本用了 `concurrently -k`，**Electron 窗口一关闭，Vite 会连带被杀掉**，后台命令以退出码 1 结束，这是正常现象。

**注意**：dev 判定为 `process.argv.includes('--dev') || !app.isPackaged`，不要只依赖 `app.isPackaged`；手动 `electron .`（不带 `--dev`）会加载 `dist/index.html`。

---

## 3. 目录结构

```
electron/
  main.js         主进程：窗口（位置记忆）、数据目录、settings/monitor/marks/focus 的 IPC、
                  进程图标、印痕另存为、备份对话框、拉起/结束采集端、单实例锁
  preload.js      contextBridge 暴露 window.api（见第 7 节）
src/
  App.jsx         状态中枢：加载设置/专注状态/印痕，组装布局，逻辑日，乐观指令，400ms 轮询
  main.jsx        React 入口
  styles.css      全部样式（单文件）
  components/
    FocusPanel.jsx     专注信息模块：进程图标/名称/选择弹窗、积分大数字、进度条、严格模式、
                       随心额度、开始/暂停/结算按钮、数据流流星特效
    StarField.jsx      星图矩阵 + 星点 + 印痕卫星（统一时钟）+ 悬停气泡
    SkyBackdrop.jsx    夜空背景（JS 随机星点，两层视差，可整体静止）
    MeteorLayer.jsx    背景流星（可开关）
    StatsBar.jsx       统计卡（总获积分池 / 连续签到 / 有效天数 / 单日最高）+ 成就展厅入口
    AchievementHall.jsx 成就展厅（纪念章网格 + 锥形打光 + 获得数量）
    PactPanel.jsx      对赌设置弹窗（日期 + 计划积分）
    DeficitPanel.jsx   赤字平账弹窗
    WhitelistPicker.jsx 特殊白名单进程多选弹窗
    Celebration.jsx    对赌达成全屏礼花（canvas）
    SettingsWindow.jsx 设置窗口（外观 / 规则 / 心理学模型 / 备份与恢复四页，区块卡片 + 逐区块恢复默认 + 数据调试）
    MarkPanel.jsx      印痕弹窗（文字 + 图片 + 右键菜单）
    ImageViewer.jsx    印痕大图查看器（滚轮缩放 / 拖动 / 右键菜单 / Esc）
    ContextMenu.jsx    通用右键菜单
  lib/
    logic.js       逻辑日、档位、渐进解锁、阶段文案、统计、伪随机、HSV 背景色、漂浮/流动档位
    achievements.js 成就定义表、判定上下文、存档校验与累计次数同步
    mock.js        示例数据生成（演示模式）
monitor/
  monitor.py       专注模块采集端（Python，需 psutil + pywin32）
  dist/monitor.exe PyInstaller 打出的单文件采集器（npm run build:monitor 生成）
scripts/
  build-monitor.mjs  调用 PyInstaller 打包采集端；自动挑选可用 Python
vite.config.mjs   Vite 配置（.mjs 避免 Vite 5 的 CJS 弃用警告）
assets/
  icon.ico / icon.png           应用图标
  fonts/SourceHanSansR.otf      思源黑体，已全局嵌入
```

> 旧版 `SettingsDrawer.jsx` 已被 `SettingsWindow.jsx` 取代并删除。

---

## 4. 核心概念

### 4.1 逻辑日（自定义日切）

`logic.js` 的 `logicalDateKey(date, dayStartMinutes)`：取 `dayStartMinutes`（默认 420 = 07:00），**早于该时刻的时间归入前一天**。20:00 到次日 01:00 的专注都记到同一天。

- 前端 `App.jsx` 用它算 `todayKey`
- 采集端 `monitor.py` 有同名实现 `logical_date_key()`，**必须与前端保持一致**
- 设置里改 `dayStartMinutes` 后，采集端 5 秒内自动重新读取

### 4.2 档位（tiers）

五档，升序，每档独立可配：`{ points, color, brightness, glow }`

默认：`1000 / 3000 / 7000 / 12000 / 20000`，亮度 `0.92 / 1.08 / 1.26 / 1.46 / 1.62`，发光 `0.35 / 0.6 / 0.9 / 1.25 / 1.7`。

- `tierIndex(points, tiers)` 返回 0..4，`-1` 表示未点亮
- **第 1 档即"有效签到线"**，达到才着色
- `tierHex()`：`color` 为 `null` 时自动向白色混合（比例 `[0, 0.1, 0.26, 0.5, 0.78]`）；最高档接近暖白
- 旧版 A/S/SS/SSS 累计评级已完全移除，等级只由 L1–L5 与明暗表现

### 4.3 渐进解锁与阶段文案

`visibleDayCount(dayNumber)`：

| 天 | 显示格数 | 含义 |
|---|---|---|
| d1 | 2 | 今天 + 明天 |
| d2 | 3 | 昨天 + 今天 + 明天 |
| d3–d7 | 7 | 补满一整周 |
| d8+ | `ceil(n/7)*7` | 每周递增 |

未解锁的格子完全不渲染。星图卡片左上角文案由 `journeyMessage(dayNumber, weekCount)` 返回（标题 / 副标题）：

| 阶段 | 标题 | 副标题 |
|---|---|---|
| 第 1 天 | 今天，点亮第一颗星 | 明天也要来哦 |
| 第 2 天 | 昨天已经亮起，今天继续 | 做的很棒！第三天也继续吧！ |
| 第 3–6 天 | 本周已走过将近一半！ | 只差几步，就是完整的一周 |
| 第 7 天 | 恭喜！这是属于你的里程碑！ | 七天不是终点，是你证明过自己的证据 |
| 整周达成 | 第 {周} 周达成 | 新的开始，继续你的征途！ |
| 新一周开始 | 新的七天，从这里开始 | 回头望望，每一个脚印都是梦想星空的一颗星星！ |
| 周中其余 | 第 {周} 周 · 第 {N} 天 | 保持这个节奏！你曾做到过，明天你也一定能行！ |

### 4.4 每日结算（重要，2.3.0 起的新语义）

`monitor.py` 的 `settle_into_cumulative()`：

1. 把 `days[key]`（本轮未结算积分）并入 `cumulative_points`；
2. 把本轮积分累加进 `settled[key]`（当日已结算总量，作为星点颜色登记）；
3. `days[key]` 清零；
4. 结算命令执行后：`running=false`、`status=idle`、连击/速度/焦点警示重置。

前端星点亮度使用 **`settled[key] + days[key]`**（见 `App.jsx` 的 `displayDays`），因此：

- 结算后星点颜色保留、不熄灭；
- 同日再次专注，星点在已登记亮度上继续叠加；
- 已结算积分只在结算时增加。

严格模式结算门槛按「今日累计（`settled + days`）」判断。

**旧数据迁移**：旧版结算会把当日积分原样留在 `days`，若直接相加会双倍。`load_data()` 使用 `settlement_version` 标记，首次启动执行一次迁移：`days[k] = max(0, days[k] - settled[k])`，之后写入 `settlement_version = 2`，不再重复迁移。

### 4.5 焦点判定与严格模式表现

采集端每 0.5 秒判定前台窗口 PID：

- 焦点命中 `selected_pids` 中任意一个：累加专注秒数（按整秒结算积分），`focus_lost=false`；
- 开启「本软件白名单」且焦点在星流（`is_self_window()` 判定主进程或其子进程）：`whitelist_paused=true`，不加分也不算偏离，严格模式同样不扣分；
- 焦点离开：`focus_lost=true`；非严格模式只重置连击，严格模式每秒扣 `punish_points`；
- 前端：`focus_lost` 时积分数字变红并发光；严格模式下数字背后的流星特效隐藏，焦点恢复后恢复显示；`whitelist_paused` 时提示「已切换到星流，计时暂停」。

---

## 5. 数据与存储

数据目录：`%LOCALAPPDATA%\StarryFlow\`（用 `app.getPath('localAppData')`，失败回退环境变量）。

| 文件 | 写入方 | 内容 |
|---|---|---|
| `settings.json` | 前端（IPC） | 界面设置，见第 9 节 |
| `focus-data.json` | 采集端 Python | 专注模块全量状态：`settings`、`days`、`settled`、`settlement_version`、`today_points`、`cumulative_points`、`history`、`allowance`、`selected_pids`（兼容旧 `selected_pid/name/path`）、`whitelist_paused`、`running`、`status`、`focus_lost`、`streak_seconds`、`current_speed`、`processes`、`notices`、`psychology`、`sleep_active`、`special_active`、`pacts`、`deficit`、`counters` |
| `focus-commands\*.json` | 主进程 | 指令队列，一命令一文件；采集端 0.5 秒扫描执行后删除 |
| `monitor-data.json` | 旧版兼容 | 首次升级时用于迁移 `days`，此后不再写入 |
| `marks.json` | 前端（IPC） | `{ "YYYY-MM-DD": { text, image, imageData, updatedAt } }` |
| `marks\*.jpg` | 主进程 | 印痕图片实体文件，文件名 `日期-时间戳.jpg` |
| `achievements.json` | 前端（IPC） | 成就存档 `{ version, unlocked: { id: { count, firstAt, lastAt } } }` |
| `window-state.json` | 主进程 | 窗口位置/尺寸/最大化状态（含所在显示器坐标） |
| `boot.log` | 主进程 | 启动诊断日志 |

**图片策略**：前端 `MarkPanel.jsx` 用 canvas 压缩到最长边 1400px、JPEG 0.82 后交给主进程落盘；`marks.json` 只存文件名，不存 base64。删除/替换时清理旧文件。

**浏览器降级**：无 `window.api` 时，设置与印痕退回 `localStorage`（key `starryflow.marks`），图片在浏览器下存 dataURL。

**进程列表**：采集端每 3 秒枚举可见窗口进程（`pid/name/title/path`），供选择弹窗显示图标与标题。

**窗口记忆**：`window-state.json` 记录 x/y/width/height/maximized；启动时校验窗口是否与任一显示器工作区有足够重叠，否则回主屏居中；拖动/缩放 600ms 防抖落盘，关窗前强制保存。

**进程记忆**：采集端启动时校验上次 `selected_pid` 仍存在且进程名一致才恢复选择（防止 PID 复用误认）；今日已结算且本轮无积分时状态直接为 `idle`（按钮显示「开始专注」）。

---

## 6. preload 暴露的 API

```js
window.api = {
  getSettings, setSettings,
  getFocusState, getFocusPath,
  sendFocusCommand(action, payload),
  getProcessIcon(exePath),              // 进程图标（主进程按路径缓存）
  exportBackup, importBackup,
  readMonitorData, getMonitorPath,
  getMarks, setMarks,
  saveMarkImage({dateKey, dataUrl, oldFile}) -> {ok, file},
  readMarkImage(file) -> dataURL | null,
  deleteMarkImage(file),
  saveMarkImageAs({file, dataUrl}),     // 右键另存为：系统保存对话框
  getAchievements, setAchievements,     // 成就存档（achievements.json）
  windowControl(action),                // 自绘标题栏：minimize | maximize（已最大化则还原）| close
  isWindowMaximized(),                  // 查询当前是否最大化
  onWindowMaximized(cb)                 // 监听最大化状态变化，返回取消订阅函数
}
```

主进程有 `markFilePath()` 用 `path.basename()` 做路径消毒；`process:icon` 用 `app.getFileIcon` 并对 exe 路径做 Map 缓存。

**单实例锁**：`app.requestSingleInstanceLock()`，重复启动只聚焦已有窗口。开发版与打包版共用同一 userData，**两者不能同时打开**。

---

## 7. 指令通道（focus-commands）

| action | payload | 说明 |
|---|---|---|
| `select` | `{ pids: [{ pid, name, path }, ...] }` | 选择专注目标（1~2 个），焦点命中任一即算专注；也兼容旧的 `{ pid, name, path }`；空数组清空选择 |
| `start` | — | 开始/继续计时 |
| `pause` | — | 暂停，保留选择 |
| `settle` | — | 每日结算（见 4.4），会同时停止本轮专注 |
| `set_strict` | `{ enabled }` | 严格模式开关 |
| `update_settings` | `{ settings }` | 专注规则（速度/加速/严格模式参数） |
| `exchange` | `{ amount }` | 已结算积分兑换额度 |
| `spend` | `{ amount }` | 花费额度 |
| `import` | `{ data }` | 备份导入（整体替换 focus 数据） |
| `refresh_processes` | — | 立即刷新进程列表 |
| `adjust_totals` | `{ points, allowance }` | **数据调试**：正负增减已结算积分与额度（下限 0） |
| `set_pact` / `cancel_pact` | `{ date, goal }` / `{ date }` | 对赌协议：只能设在逻辑日之后的日期，保存 goal/ratio/reward 快照 |
| `pay_deficit` | `{ amount }` | 平账：从当日累计（先 days 后 settled）扣除并等额减少赤字 |

采集端主循环 0.5 秒：读日切、消费指令、按需刷新进程、焦点判定、按整秒累积积分/扣分、写盘。前端 400ms 轮询状态；开始/暂停/选进程/严格模式采用**乐观更新**，并用 `pendingCommandRef` 在采集端确认前跳过覆盖（1.5 秒超时兜底）。

---

## 8. 设置项清单

| 区块 | 字段 | 默认 | 说明 |
|---|---|---|---|
| 软件背景 | `background {hue, saturation, value}` | 222 / 60 / 13 | HSV 0–360 / 0–100 / 4–30；派生 `--bg`、`--bg-deep`、`--card`、`--card-hover`、`--border`、`--border-soft`、`--cell-empty` |
| 星点外观 | `starShape` | `star4` | `star4` / `circle` / `rounded` |
| | `starColor` | `#ffd75e` | 主色，驱动全局 `--accent` |
| 星点漂浮 | `starMotion.enabled` | `true` | 总开关 |
| | `starMotion.amplitude` | 2 | 0–12 px |
| | `starMotion.speed` | 3 | **档位 1–5**（周期 20/12/6/3/1 秒，越高越快） |
| 印痕环绕 | `orbit.enabled` | `true` | 印痕卫星的环绕动效总开关；关闭后改为星点右下角的固定光点，不再逐帧刷新 |
| | `orbit.speed` | 3 | **档位 1–5**（周期 7/5.2/3.8/2.6/1.6 秒，3 档即原有速度） |
| 夜空 | `sky.density` | 1 | 0.4–2 倍星点数量 |
| | `sky.animated` | `true` | 星空动态总开关（流动/闪烁/流星） |
| | `sky.followPoints` | `true` | 积分越高流速越快 |
| | `sky.flowSpeed` | 3 | **档位 1–5**（基础周期 60/40/28/18/10 秒） |
| 当日判定 | `dayStartMinutes` | 420 | 新一天起点 |
| | `settleMinutes` | 240 | **⚠ 仅存在于 UI，无逻辑消费** |
| 进程监控 | `maxWorkGroups` | 3 | 3~7，选择列表展示的工作组条数（内部最多保留 20 条历史） |
| | `selfWhitelist` | `false` | 专注期间切到星流不算偏离：普通模式暂停加分，严格模式暂停且不倒扣 |
| | `processHistory` | `{groups:[],singles:[]}` | 选择历史：双进程工作组与常用单进程，按使用次数降序 |
| 心理学模型 | `psychology.healthySleep {enabled, bedtimeMinutes, normalSpeed, strictSpeed}` | false / 1410 / 1 / 2 | 健康就寝：到点后普通与严格模式积分速度降为设定值，就寝时段内结算 +1 枚纪念章 |
| | `psychology.pact {enabled, ratio, reward}` | false / 80 / 100 | 对赌协议：未来星点设目标，达标奖励比例与未达判定比例（50~100、50~150，步进 5） |
| | `specialWhitelist {enabled, normalSpeed, strictSpeed, items}` | false / 2 / 3 / [] | 特殊白名单：最多 5 个进程（可含本软件），命中后不算偏离、继续积分但降速 |
| 积分档位 | `tiers[]` | 见 4.2 | 阈值 / 颜色 / 明度 / 发光；设置页单列，色块与选色靠左 |
| 旅程 | `startDate` | 无 | 起始日，仅用于计算旅程天数、解锁进度与统计范围；界面已无重置入口 |
| 设置窗口 | `settingsTab` | `appearance` | 上次停留的分类页 |

专注规则保存在 `focus-data.json` 的 `settings` 内（基础速度、加速段、严格模式、兑换比例、额度名称），由设置窗口经指令通道修改，区块可单独恢复默认。

**兼容迁移**：`mergeSettings(saved)` 负责补齐缺失字段、校验 tiers、把旧的秒数型 `starMotion.speed` / `sky.baseDuration` 折算成新档位（`speedToLevel` / `durationToLevel`）。

---

## 9. 视觉实现要点（改样式前必读）

### 9.1 星点
- 每格 `.star-slot` 42×42px，7 列一行
- 三种形状都用内联 SVG path；未点亮用 `stroke-dasharray` 虚线 + 淡蓝微光 + 呼吸
- 虚线用 `pathLength="100"` 归一化，`dasharray 8.5 1.5`，保证闭合无缝
- 发光用 `drop-shadow` 跟随真实轮廓

### 9.2 星点漂浮
- 8 组 keyframes（`float-a`…`float-h`）按日期哈希分配
- 每颗星额外随机：幅度 55%–100%、周期 1.0–1.4 倍、相位错开
- 速度档位 → `motionPeriod(level)`（20/12/6/3/1 秒），5 档最快 1 秒

### 9.3 夜空与流星
- `SkyBackdrop.jsx` **用 JS 随机生成星点**（`seededRandom`），两层视差、宽 200% 无缝循环
- `sky.animated=false` 时根节点加 `is-static`：星野与闪烁 `animation: none`，`MeteorLayer` 清空并不再生成流星
- 背景流星每 4.2–10.7 秒一颗，1.5–2.4 秒向左下划过，尾迹方向由同一组位移向量推导

### 9.4 印痕卫星（`OrbitTrail`）
参数在 `StarField.jsx` 顶部：`ORBIT_A=46`、`ORBIT_B=27`、`TAIL_SPAN=1.55`、`TAIL_SEGS=20`、`HALO_SEGS=10`；环绕周期由设置 `orbit.speed` 经 `orbitPeriod()` 取 `ORBIT_PERIODS`（7000/5200/3800/2600/1600 ms）决定。

- **所有卫星共用同一绝对时钟**：`p = (now % period) / period`，任意时刻角度一致，整体整齐
- `orbit.enabled=false` 时不启动 rAF、不渲染轨道尾迹，改为在星点右下角显示一个固定光点（`cx=76 cy=76`，`svg` 加 `.is-fixed` 取消 -14° 倾斜）
- 卫星渲染在 `.star` 内部（作为星点的子元素），随父级同一份 `float-*` transform 动画移动，因此环绕轨道或固定光点都天然与星点保持相对位置；`.star-svg` 承担发光滤镜，避免 `filter` 影响卫星
- **不要给卫星单独复制一份漂浮动画**：CSS 动画的零时刻绑定元素挂载时机，两个独立元素即使参数完全相同，也会因挂载时刻不同产生相位差（表现为卫星有自己的运动）
- 逐帧用参数方程写 SVG 属性，不用 CSS 旋转+缩放
- 尾迹亮芯 20 段 + 光晕 10 段，每段 `stroke-linecap: butt`、端点精确相接
- 颜色 `currentColor`，卫星与尾迹同色；上半圈整组透明度降到 55%

### 9.5 严格模式数字特效
- `.focus-number-wrap` 内渲染 `StrictMeteors`（7 条），`strict.enabled && !focusLost` 时显示
- 流星：圆点直径 2.4px、尾迹高 2.4px，同行 flex 居中（`row-reverse`，头部在右、尾迹拖在左侧）；自左向右、淡入淡出（0.9–1.6 秒错峰）
- 位置用容器查询单位 `cqw` 计算穿越距离
- `focus_lost` 时数字加 `.lost`：红色 + 双层红光，特效隐藏

### 9.6 印痕窗口与查看器
- 图片：`width:auto / height:auto` + `max-width:100% / max-height:320px`，圆角 14px、边框紧贴图片本身
- 双击打开 `ImageViewer`：滚轮以指针为锚点缩放（30%–500%）、拖动平移、「适应窗口」复位
- 右键菜单（`ContextMenu`）：缩略图为「查看大图 / 另存为」，查看器为「另存为 / 适应窗口 / 关闭查看」
- Esc 用捕获阶段拦截，只关最上层（菜单 → 查看器 → 面板）
- 另存为走主进程 `dialog.showSaveDialog`：已落盘图片复制原文件，未落盘按 dataURL 写出

### 9.7 布局与配色
- 页面 `--bg` 由背景 HSV 派生，`.app` 根节点内联声明 `--accent` / `--tier-1..5`
- 半透明同色统一用 `color-mix(in srgb, var(--accent) N%, transparent)`
- 字体：思源黑体 `assets/fonts/SourceHanSansR.otf`，CSS `@font-face` 全局套用
- 设置窗口：`settings-mask` / `settings-window`（940px，86vh），区块 `.settings-section` 圆角框 14px、内边距 16–18px、间距 16px、左右等高（`align-items: stretch`）
- 开关：全局 `.switch` 为 44×24 胶囊（滑块 16px 圆形）；专注卡片内的严格模式开关用 `.focus-strict .switch` 覆写为 78×34，与「更换进程」按钮（同为 78×34、圆角 8px）尺寸一致，滑块 24×24、圆角 8px、四边各留 4px，开启态滑块左移到 48px；开启时轨道与滑块均带 `--accent` 发光，关闭态 `box-shadow: none`
- 按钮：`.focus-main-btn` 与 `.focus-sub-btn` 共用 `.focus-panel` 的 `--focus-btn-h`（44px）+ `padding: 0 28px` + 14px 字号，实测均为 114×44
- 对齐约束：`.focus-head` 与 `.focus-foot` 同级、同内边距，「每日结算」右边缘与严格模式开关右边缘同为卡片内容区右边界
- 设置页开关行：三个动效开关（`启用漂浮动效` / `启用环绕动效` / `启用动态星空效果`）在开启时于标签右侧显示低可视度小字「开启后可能增加性能负载」（`.field-note`，11px / `--text-faint` / 0.7 透明度）
- 时间输入框：`::-webkit-calendar-picker-indicator` 用 `filter: invert(1)` 把系统黑色钟表图标反色，适配深色背景
- 沉浸式标题栏：`BrowserWindow` 使用 `frame: false`，`.titlebar-strip`（顶部固定 28px）与 `.app-header` 都设为 `-webkit-app-region: drag`，其中按钮/输入框设 `no-drag`；右上角三个自绘按钮（36×32、12px 线条 SVG）经 `windowControl()` 调用主进程；最大化状态由 `window:maximized` 事件同步，用于切换「最大化 / 还原」图标；无边框窗口仍保留 `WS_THICKFRAME`，可从边缘拖拽缩放

---

## 10. 已踩的坑（务必避免重犯）

1. **打包后采集端"消失"**：`monitor.py` 不能进 `app.asar`；`extraResources` 到 `resources/monitor/`；`Start-Process` 启动会回收进程树（改用 `explorer.exe`）；Python 不在 PATH 时按 `F:\PYTHON\python.exe` 兜底。
2. **标题颜色改了不生效**：`h1` 有 `background-clip: text` + `-webkit-text-fill-color: transparent`，内联 `color` 无效，必须改渐变。
3. **不要写死颜色**：曾残留 GitHub 绿；统一用 `var(--accent)` / `color-mix`，包括 tooltip、textarea、弹窗背景。
4. **CSS 旋转 + scaleY 会把圆点压扁**：椭圆轨道必须逐帧算坐标。
5. **分段 stroke 用 round 端点产生斑马纹**：必须 `butt` + 端点精确相接。
6. **光晕两点直连会变直线**：必须沿路径分段采样。
7. **CSS 背景平铺在密度调高时暴露规律**：星野必须 JS 随机生成。
8. **`concurrently -k` 关窗会杀掉 dev 进程**：属正常，判断实例看端口与 electron 进程。
9. **React `key` 与保留属性冲突**：自定义星点组件用 `dateKey` 命名。
10. **`app.getPath('localAppData')` 可能抛错**：已做回退，日志出现「回退到…」属预期。
11. **多开窗口会把 GPU 打满**：禁止同时开多个实例；已加单实例锁。日志中的 `GPU process exited unexpectedly`、`Network service crashed`、`WSALookupServiceBegin failed` 属本机噪音，不要改业务代码。
12. **采集端退出码 `null`**：`kill()` 的正常结果，不是崩溃。
13. **结算旧数据双倍**：旧版结算保留 `days`，新显示逻辑会与 `settled` 相加。迁移只在 `settlement_version` 缺失时执行一次；**不要重复运行迁移逻辑**。
14. **查看器 Esc 冲突**：查看器与印痕面板都在 window 监听 Esc，查看器必须用捕获阶段 + `stopPropagation`，否则一次 Esc 关闭两层。
15. **右键菜单被全局 mousedown 关掉**：菜单容器必须 `onMouseDown` / `onClick` 阻止传播，否则点击菜单项无效。
16. **乐观更新被轮询闪回**：点击后 400ms 轮询可能先读到尚未消费的旧状态；用 `pendingCommandRef` + `commandConfirmed` 在确认前跳过覆盖（1.5 秒超时）。
17. **CSS 编辑替换时不要误删规则头**：曾把 `.mark-image-remove {` 一起替换掉导致后续属性失效，替换长块时保留选择器行。
18. **无边框窗口拖拽区**：`-webkit-app-region: drag` 会吞掉鼠标事件，拖拽区内的按钮/输入必须显式 `no-drag`；顶部固定拖拽条需高于页面内容层级，但低于设置弹窗（100）与气泡（50）。
19. **无边框窗口启动闪色**：`backgroundColor` 写死 `#0d1117` 与默认背景 `#060e24` 不一致，启动瞬间会露出白/灰底，已改为与默认背景一致。
20. **两套 CSS 动画不会自动同步**：`animation-delay` 的负相位是相对「该元素动画开始的时刻」计算的，两个元素即使动画参数完全相同，只要挂载时刻不同（例如印痕是运行中新建的、卫星后出现），相位就会错开。需要跟随运动时，必须让子元素共享父级的同一份 transform 动画，而不是复制动画。

---

## 11. 待办（按优先级）

1. **便携版（portable）**：当前只产出了 nsis setup；如需单文件便携版，执行 `npx electron-builder --win portable`，`portable.artifactName` 已配置为 `StarryFlow-Portable.exe`。
2. **`settleMinutes` 决定去留**：UI 有「结算封存」输入框但无逻辑消费，实现「次日封存」或从 UI 移除。
3. **交付前全量文案审查**：清理口语化指令残留、阶段标记、技术内部词；统一用词与量词（星点引导文案已按用户要求改写，其余界面文案仍需复查）。
4. **托盘与关窗行为（待用户确认）**：当前关窗即退出并结束采集端；若常驻托盘需拦截 `close` + `Tray`。
5. **低功耗模式（可选）**：降低动画帧率、窗口失焦暂停 canvas 重绘，或提供 `app.disableHardwareAcceleration()` 开关。
6. **成就条目与美术待定**：`src/lib/achievements.js` 现有 8 个成就（含乖乖睡觉 / 平账大师 / 对赌成功），纪念章图形在 `AchievementHall.jsx` 的 `MedalArt` 中用 SVG 绘制；正式条件与美术确定后替换定义与图形即可。
7. **2.12.0 未打包**：下次出包需先 `npm run build:monitor` 再 `npm run pack` / `npm run dist`。

---

## 12. 协作规则（用户明确要求，务必遵守）

1. 每轮改动后必须关闭旧实例、清理进程、启动全新实例交给用户查验；收尾前确认 `5173` 在监听且 electron 主进程存在。
2. 每轮必须以纯文本段落收尾，其后不得再有任何工具调用（否则整轮会被客户端折叠成摘要卡片）。
3. 思考过程全程中文。
4. 依赖下载卡顿立即切国内镜像（npm 用 `registry.npmmirror.com`，pip 用清华源）。
5. 不做无要求的重构、不提前抽象、不写多余兜底。
6. 需要用户决策时才问，能自己判断的直接做并说明。

---

## 13. 验收方法（无真实数据时）

星图卡片底部有「示例预览」按钮条（第 1 / 2 / 3 / 7 / 8 / 15 / 22 天），仅在无真实采集数据（演示模式）时显示，用于查看各天解锁状态。接入真实采集后该条消失。

自动化验收可用 `browser_use` 访问 `http://localhost:5173`，配合 `getComputedStyle` / `getBoundingClientRect` / SVG 属性读取做数值级验证；浏览器模式下无 `window.api`，专注相关真实数据需在 Electron 内验证，或直接向 `focus-commands/` 写入指令并用 `focus-data.json` 校验采集端结果。

---

## 14. 版本记录

| 版本 | 日期 | 内容 |
|---|---|---|
| 2.12.0 | 2026-11-03 | 新增特殊白名单：规则设置内最多选 5 个进程（可含本软件），命中后不算偏离、继续积分但按普通/严格模式各自的设定速度降速；设置页胶囊展示与多选弹窗 |
| 2.11.1 | 2026-11-02 | 「健康就寝模式」「对赌协议」开启时，文案右侧显示主题色发光的「已激活」标记（13px，双层 text-shadow） |
| 2.11.0 | 2026-11-02 | 设置新增「心理学模型」页：德西效应 · 健康就寝（到点降速、就寝结算得纪念章）；损失厌恶效应 · 对赌协议（未来星点设目标、达标奖励与全屏礼花、未达比例产生赤字、平账得纪念章）；新增三枚成就与 8 种 SVG 纪念章图形 |
| 2.10.3 | 2026-11-02 | 「成就展厅」入口右下角光晕中心再向右下外移（`right: -86px / bottom: -96px`） |
| 2.10.2 | 2026-11-02 | 「成就展厅」入口右下角光晕改为更大范围、更强弥散、更低不透明度，光源移到卡片边角之外 |
| 2.10.1 | 2026-11-02 | 「成就展厅」入口卡片内部右下角增加主题色光晕（径向渐变 + 模糊，悬停增强） |
| 2.10.0 | 2026-11-02 | 新增成就系统：条件达成自动获得纪念章、可多次获得；右下角「成就展厅」入口与展示窗口（纪念章 + 锥形打光 + 获得数量）；成就存档独立落盘并纳入备份。成就条目与纪念章美术暂为占位 |
| 2.9.1 | 2026-11-02 | 新增多进程工作组（最多两个进程同时监控，任一命中即专注）；选择列表加入工作组 / 常用历史（按使用频率排序，工作组数量 3~7 可调）；新增「将本软件列为默认白名单」开关（严格模式也暂停不倒扣）；选择弹窗改用 portal 修复极简模式溢出 |
| 2.8.1 | 2026-11-01 | 积分术语区分：专注面板「本日累计」、数据统计「总获积分池」、设置与采集端「已结算积分」；「本日累计」移到面板底部左侧并与随心额度共用同一套字体配置 |
| 2.8.0 | 2026-10-31 | 新增极简模式（可缩放竖屏面板、圆环进度、中心星点与积分、面板内星空）与迷你模式（透明置顶浮窗、星点 + 积分、严格模式呼吸光环）；三模式独立记忆位置与尺寸；提示统一为底部 toast；修复迷你配色发脏 |
| 2.7.0 | 2026-10-31 | 设置新增「备份与恢复」页：积分/额度、印痕文字、印痕图片三项数据路径可查看、打开、更改与恢复默认，导入/导出备份迁入该页；采集端跟随自定义目录；设置窗口切换标签时高度平滑过渡 |
| 2.6.3 | 2026-10-31 | 沉浸式自绘标题栏（`frame: false`、顶部拖拽条、右上角三键、窗口状态同步）；设置按钮与窗口按钮间距排布；修复印痕卫星相位漂移（卫星改为星点子元素）；产出 setup 安装版 |
| 2.6.1 | 2026-10-31 | 新增「印痕环绕」设置（开关 + 5 档速度，关闭为右下角固定光点并随星点漂浮）；全站「贡献 / 分」统一为「积分」；三个动效开关改名并加性能提示；时间图标反色、悬停气泡放大、进度提示左对齐、兑换行间距；产出 setup 安装版 |
| 2.4.0 | 2026-10-30 | 移除「新的旅程」重置入口；严格模式改滑块开关（与「更换进程」同尺寸、开启发光）与提示文案；严格模式数字流星改为自左向右；两个主按钮统一为 114×44 且右边缘对齐；本地 git tag `v2.4.0` |
| 2.3.0 | 2026-10-30 | 界面重构（信息模块 / 设置窗口 / 背景 HSV / 星点与星空档位 / 卫星同步 / 严格模式流星 / 焦点警示）、结算新语义、数据记忆、数据调试、查看器与右键菜单、响应提速、阶段文案改写；本地 git tag `v2.3.0` |
| 0.1.0 | 2026-10-29 | 首个可运行版本：主视觉 MVP、设置抽屉、印痕、专注模块接入、打包验证 |
