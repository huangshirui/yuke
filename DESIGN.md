# Yu言在线 Design Guidelines / 设计规范

> 本文件是 Yu言在线仓库的 UI / UX 设计基线。涉及 Web Admin、小程序页面结构、视觉样式、交互模式或组件设计的修改，必须先阅读并遵从本文件。
>
> Product semantics are defined by the shared Contract and domain docs. UI must express the domain; UI must not redefine it.

## 1. Design goals / 设计目标

Yu言在线是一个通用预约工具。设计首先服务于**清晰、效率、可信赖和低学习成本**，而不是追求装饰性视觉。

核心原则：

1. **任务优先 / Task first**  
   页面首先帮助用户完成创建、查看、修改、取消、配置等任务。

2. **信息层级清晰 / Clear hierarchy**  
   标题、状态、主要操作、次要信息应一眼区分；避免把所有元素做成同样的视觉重量。

3. **克制而专业 / Restrained and professional**  
   少装饰、少渐变、少大面积高饱和色，不做“营销落地页式”后台。

4. **领域一致 / Domain consistency**  
   Web、小程序、API 使用相同的领域词汇和状态语义，不为某个页面重新发明概念。

5. **状态可解释 / Explain state**  
   Disabled、Frozen、Revoked、Expired、Conflict 等状态必须通过文字表达，不只依赖颜色。

6. **危险操作显式 / Explicit destructive actions**  
   停用、撤销、取消等操作使用清晰动词；不可通过模糊图标隐藏重要影响。

7. **响应式但不牺牲效率 / Responsive without losing efficiency**  
   Admin 桌面优先；小屏仍需可完成任务，但不强求与桌面完全同构。

---

## 2. Product terminology / 产品术语

对外 UI 使用通用预约语言，避免教育行业特定角色词。内部 Contract、代码和 Admin 管理语境继续使用稳定领域术语；小程序用户端使用面向任务的自然语言，避免直接暴露抽象领域模型。

| Domain | 小程序用户 UI | Admin / 内部中文 | English |
|---|---|---|---|
| Space | 服务方 | 空间 | Space |
| Resource | 预约项目 / 预约什么 | 预约对象 | Resource |
| Participant | 常用预约人 / 为谁预约 | 参与人 | Participant |
| Slot | 可预约时间 | 可预约时段 / 时段 | Slot |
| Slot Type | — | 时段类型 | Slot Type |
| Booking | 预约 | 预约 | Booking |
| Customer (Mini Program User) | 用户 | 客户 | Customer |
| Web Admin User | — | 用户 | User |
| Space Admin | — | 空间用户 | Space User |
| Super Admin | — | 超级用户 | Super User |
| Invite Code | 邀请码 | 邀请码 | Invite Code |

小程序预约路径优先使用动作式表达：“选择服务方 → 预约什么 → 选择时间 → 为谁预约 → 确认预约”。

小程序审核相关页面不要使用“家长 / 学生 / 老师”等行业角色词作为核心业务术语。

Web Admin 对外术语固定为：后台登录账号一律称“用户”，微信小程序侧账号一律称“客户”。页面不得暴露认证供应商名、内部类型名（如 `AdminUser`）或 `adm*` / `mem*` / `spc*` 等内部技术 ID。

---

## 3. Web Admin visual direction / Web Admin 视觉方向

### 3.1 Confirmed style / 已确认风格

Web Admin 采用：

- **现代 B2B SaaS 管理后台**
- 工具型、克制、低噪音
- 深色侧边导航 + 浅色内容区
- 白色 Card / Panel 承载主要工作区
- 深墨绿色作为主操作色
- 黄绿色作为品牌强调点，但不大面积使用
- 不采用传统“重表单、重边框、重蓝色”的后台风格
- 不要求与小程序视觉完全相同；两端保持品牌与语义一致即可

当前已确认的 Admin Shell 是设计基线，不应在后续 Issue 中随意整体改版。

### 3.2 Design Token System / 设计 Token 系统

Web Admin 的可复用视觉参数统一定义在：

`apps/admin/src/tokens.css`

Token 分为六类：Color / 颜色、Spacing / 间距、Radius / 圆角、Typography / 字号、Controls / 控件，以及 Elevation & Focus / 阴影与焦点。Spacing primitive 直接按实际 px 值命名（例如 `--space-12: 12px`）；新布局优先使用 4px 主网格，odd 值仅用于保留既有紧凑/光学校准。

规则：

- 页面和组件不得新增裸写品牌色、状态色或 `rgba(...)`；新颜色必须先进入 `tokens.css`。
- padding / margin / gap、圆角和字号统一使用 Token；**页面结构专属的一次性尺寸**（例如 Calendar 列宽、图表固定高度、特定 Popover 宽度）可以保留局部值，不为了“零数字”制造无意义 Token。
- Select 统一使用自定义 Chevron，不使用浏览器原生箭头；右侧留白、箭头大小和距右边界位置由 `--select-*` Token 控制。
- 不在单个页面重新定义控件视觉参数。
- Token 的全局视觉变化必须先更新本文件，再修改实现。

核心语义示例：

```css
--color-text-primary: #17202a;
--color-border: #e3e8eb;
--color-surface: #ffffff;
--color-primary: #126e62;
--space-4: 4px;
--space-8: 8px;
--space-12: 12px;
--space-16: 16px;
--space-24: 24px;
--control-height-md: 38px;
--control-height-touch: 42px;
--select-padding-right: 44px;
--select-chevron-offset: 16px;
```

### 3.3 Typography / 字体

默认使用系统 UI 字体栈：

```css
Inter,
ui-sans-serif,
-apple-system,
BlinkMacSystemFont,
"Segoe UI",
sans-serif
```

原则：

- 中文正文优先可读性，不使用装饰性字体。
- ID、code、技术标识使用 monospace。
- 页面主标题明显但不过度巨大。
- 表格表头、辅助说明和 Eyebrow 使用较低视觉重量。

---

## 4. Web Admin layout / Web Admin 布局

### 4.1 Application shell

桌面端采用 **Current Space 驱动的侧边运营控制台**：

```text
┌──────────────────────────────────────────────┐
│ Sidebar          │ Page heading              │
│ Current Space    │                           │
│ identity/switch  │ Main work area            │
│ grouped nav      │                           │
│                  │                           │
│ Admin identity   │                           │
└──────────────────────────────────────────────┘
```

当前基线：

- Sidebar：约 248px；
- 不保留固定全局 Topbar，页面主体直接从 Page heading 开始；
- 主导航始终表达当前 Space 的运营功能；
- Sidebar 顶部不再固定展示产品品牌标题，而是直接展示当前 Space 身份；
- 当前 Space 身份区同时承担 Space Switcher：Logo + Space 名称 + “运营后台”辅助文案 + 切换箭头整体可点击；
- Space Logo 默认由 Space 名称自动生成文字标识（取名称首字符）；未来如增加自定义 Logo，则优先显示自定义 Logo；
- 当前登录用户身份与退出登录入口保留在 Sidebar 底部；
- Space Switcher 不显示内部 ID 或时区；
- 默认入口恢复上次可访问 Space 并进入“概览”；
- /spaces 仅作为 Super Admin 的低频空间管理入口；
- Page desktop padding：约 20–24px；页面顶部优先 18–20px，避免 Page heading 吞噬工作区；
- Desktop 页面 H1 约 24–26px，Mobile 约 21–23px；后台以高信息密度为目标，不使用营销页式大标题；
- Desktop 正文 / Button 通常 13–14px，Mobile 正文 / Button 通常 14px；Mobile 通过点击目标尺寸保证可用性，而不是简单放大所有字体；
- 主工作区使用 Card / Panel，而不是把每个字段拆成单独卡片

### 4.2 Page hierarchy

标准页面顺序：

1. Compact Page heading
2. Primary action
3. Main work surface / table / calendar / form
4. Optional secondary information

运营型页面默认不放 Summary / Metrics 卡片；统计信息应进入“概览”或专门的数据视图，除非数字本身直接决定当前任务。

不要把次要说明放在主操作之前。Page heading 的说明必须短；熟悉后不再需要的帮助信息应改为 Tooltip / Info，而不是永久占据一整行。

---

## 5. Components / 组件原则

### Buttons

- Primary：一个局部操作区域通常只有一个主按钮。
- Secondary / Ghost：普通操作。
- Danger：撤销、删除语义、停用等高风险操作。
- Link button：查看详情、进入关联数据等轻量导航。
- 日期 / 分页类 Icon-only 导航按钮：Desktop 使用紧凑 32×32px；Mobile 保留 40×40px 点击目标；统一使用 SVG Chevron，不使用字体字符 `‹ / ›`。

按钮文案优先使用明确动词，例如：

- 新建空间
- 保存规则
- 分配管理员
- 撤销邀请码
- 停用空间

避免：

- 确定
- 提交
- 操作
- 更多

如果上下文无法明确其具体结果。

### Tables

适用于 Admin 中高密度列表。

规则：

- 最重要实体放第一列。
- 状态使用文字 Badge。
- 操作放最右。
- 内部 ID 默认不在运营界面展示；只有明确的诊断/支持场景才允许显示，并且不能作为业务识别信息。
- 空状态必须解释下一步，而不是只显示“暂无数据”。

### Forms

- Label 永远可见，不用 Placeholder 代替 Label。
- Helper text 用于解释业务影响，而不是重复字段名。
- 同一组设置尽量集中在一个 Panel。
- 固定枚举使用 Select / Radio，而不是自由输入。

### Tabs

适用于同一实体下的不同管理子域，例如：

- 预约规则
- 管理员
- 邀请码

Tabs 不应用于跨业务模块的全局导航。

### Detail navigation / 详情交互

Admin 不使用 Inline Expansion / 行内展开详情。详情必须落在以下三种模式之一：

- **Detail Page**：长期存在、有身份、有历史或子实体的对象，例如用户；
- **Modal / Dialog**：新建轻量实体、快速处理预约、编辑时段、简短确认；
- **Popover**：空间切换、简单菜单、轻量选择。

列表行本身可以点击进入 Detail Page；不要同时要求用户再点击一个冗余的“查看详情”按钮。

### Modals

适合：

- 新建轻量实体；
- 快速处理预约；
- 新建 / 编辑开放时段；
- 简短确认；
- 不需要大量上下文的编辑。

复杂、长期存在的实体详情应进入独立页面，不堆成行内 Panel。

---

## 6. Interaction states / 交互状态

每个异步操作至少考虑：

- Loading
- Success
- Empty
- Error
- Disabled / unavailable

原则：

- **Static shell first / 固定结构优先**：进入页面时立即渲染 Page heading、Tabs、筛选器、Panel heading、Table header、Calendar grid 等稳定结构；不得先用“正在加载…”空白页替换整个工作区。
- 数据读取中的 Loading 采用数据区域内的局部 Overlay / Spinner；刷新筛选、切换日期或切换周时也保持稳定结构，数据完成后原位填充。
- Empty State 只能在请求完成且确认数据为空后出现，不能在 Loading 期间短暂闪现“暂无数据”。
- 刷新同一上下文时优先保留已有数据并覆盖 Loading；切换到不同日期/上下文、旧数据会产生误导时，可以清空旧数据，但固定结构仍保持可见。
- 保存期间阻止重复提交。
- 操作成功提供短反馈。
- API Error 使用用户能理解的中文提示。
- Web Admin 登录认证成功但项目侧未授予后台访问权限时，不进入 Admin Shell，也不展示内部错误文案；显示独立的“无后台访问权限”过渡页，并自动退出当前登录会话，让用户重新选择已授权账号。
- 冲突类错误应解释下一步，不直接展示数据库异常。
- 不通过刷新整页来掩盖状态管理问题。

典型例子：

```text
SLOT_ALREADY_BOOKED
→ 这个时间刚刚被预约了，请选择其他时间。
```

### Slot operational state / 时段运营状态

Admin 周历默认展示 **07:00–24:00**，以 30 分钟为交互网格；这是日历工作区的默认可视范围，不改变 Slot 本身可使用精确开始/结束时间的领域语义。切换周/日期时应先更新固定日历网格与日期标题，并在数据区显示 Loading Overlay，待 Slot 数据返回后原位填充。


Slot 是预约工作台的核心时间资源，但 UI 不应把所有业务状态塞进一个 SlotStatus。日历展示优先级：

1. 有 Booking 时，**服务事实优先**：用户 / 参与人 + 已预约或已完成；
2. completed Booking 同时展示 **待对账 / 已对账**；
3. Frozen 是附加运营限制，可叠加在“已预约/已完成”之后；
4. 没有 Booking 时才显示“可预约 / 已冻结 / 已占用”等时段可用性；
5. cancelled Slot 默认不出现在主日历，可在历史/筛选场景查看；
6. 状态必须有文字，不只使用颜色。

典型显示：

```text
10:00–10:30
张三 · 小明
已完成 · 已对账
```

取消 Slot 属于危险操作：有 booked Booking 时必须先取消 Booking；completed Booking 对应的历史 Slot 不允许取消。前端只是解释和引导，后端约束是最终事实源。

### Calendar as operational workspace / 日历作为运营工作台

预约日历是运营人员的主工作上下文，不是预约列表的跳板。默认交互必须遵循：

- 日历卡片主信息只表达“空”或“用户名 · 参与人”；时间、业务状态与时段类型作为次级信息。
- Desktop 周历必须以最短 30 分钟 Slot 仍清晰可读为基线：卡片正文使用单行主信息 + 紧凑状态，不在短卡片里纵向堆叠“时间 / 人员 / 状态”三行；精确时间与完整状态可通过网格位置、Tooltip / title 和 Detail Drawer 获取。
- 颜色用于快速区分空闲、已预约、已完成待对账、已完成已对账等运营状态，但必须同时保留文字状态，不能只靠颜色。
- 点击空 Slot 在当前日历上下文打开 Slot Detail；点击 booked / completed Slot 在当前日历上下文打开 Booking Detail。
- Desktop 默认使用右侧 Detail Drawer；Mobile 使用底部 Sheet。关闭详情后必须保留当前 Space、Resource、周次 / 日期与滚动位置。
- Booking Detail 可以在原地执行取消预约、标记完成、标记已对账等高频动作；处理完成后原位刷新日历状态。
- Booking Detail 可通过“查看所属时段”切换到对应 Slot 信息，但不应自动跳转到预约列表页。
- 只有用户主动选择“查看完整记录”等明确导航动作时，才允许离开当前日历工作区。

该模式的目标操作路径是：**扫 → 点 → 处理 → 关闭**，而不是“扫 → 跳页 → 找记录 → 处理 → 返回 → 找回原位置”。

---

## 7. Responsive behavior / 响应式

### Web Admin

Admin 为桌面优先，但必须保证手机浏览器可完成全部核心运营任务。

窄屏：

- 固定桌面 Sidebar 转为顶部结构：当前 Space 身份/切换 → 横向功能导航 → 当前账号；
- 预约工作台 Desktop 默认周历；Mobile 默认单日 Agenda / Day View，不把 7 列周历强行压缩到手机宽度；
- Current Space Switcher 在移动端使用覆盖式弹层，仍只展示空间名称；
- 功能导航横向滚动，不因小屏隐藏核心功能；
- Dashboard 指标先两列、窄手机改单列，主要运营卡片全部改单列；
- 表格允许横向滚动，不把高密度管理表格强行压缩成不可读卡片；
- 筛选、双列表单与详情元数据转单列；
- Modal / Drawer 在手机上使用底部弹层式布局并考虑 safe-area；
- 页面级主要操作允许换行或独占一行；
- 不因为移动端而删除重要功能。

当前参考断点约为：

```css
@media (max-width: 820px)
```

未来如统一断点体系，应在本文件更新。

### Mini Program

小程序采用移动端原生交互，正式视觉基线为 **轻量、原生感的通用工具风格**：

- 页面背景使用浅灰 `#F6F7F9`，主要内容使用白色 Surface；
- 主操作复用品牌深墨绿 `#126E62`，不新增独立蓝色品牌体系；
- 黄绿色品牌强调点只作小面积点缀，不用于大面积按钮或背景；
- Card 默认 16rpx 圆角，使用弱边框区分层级，默认不依赖阴影；
- 页面保持大面积留白、低视觉噪音，不使用大面积渐变、装饰插画或教育场景化视觉；
- 表单优先微信原生交互，Label 始终可见；
- 每个页面原则上只有一个 Primary CTA；
- 单手操作、点击目标清晰、预约路径短；
- 状态和时间信息优先；
- 不照搬 Web Admin 的 Sidebar / Table 模式。

小程序基础层级：

- Page title：36–40rpx / semibold；
- Section title：30–32rpx / semibold；
- Body：28rpx；
- Secondary / Caption：22–26rpx；
- Card / Input / Button 间距遵循 8rpx 基础网格。

小程序全局视觉 Token 统一定义在 `apps/miniprogram/app.wxss`，页面样式只消费语义变量，不重复声明颜色值。当前 Token 分为：

- `--color-*`：背景、Surface、文字层级、边框、品牌、状态与遮罩；
- `--space-*`：基于 8rpx 网格的间距；
- `--radius-*`：小圆角、控件圆角、Card 圆角与胶囊圆角；
- `--font-*`：标题、分区标题、正文、辅助文字和微型标签；
- `--control-*`：标准与紧凑控件高度。

日程页是小程序的视觉基准：其它页面应复用相同的白色 Surface、弱分隔线、深墨绿主操作、扁平列表行、状态 Badge 和底部弹层，不再为单页维护独立色板。通用样式优先复用 `.card`、`.list-surface`、`.list-row`、`.primary-button`、`.secondary-button`、`.danger-button`、`.compact-button`、`.status-badge` 和统一空状态。

小程序页面操作位置按任务层级统一：

- 可直接创建内容的列表页，在非空状态使用标题区紧凑主按钮；空间紧张且页面标题已明确对象时可使用“新增”，其余场景使用“发起预约”等完整动作；
- 选择或切换类列表以列表选择为主任务，低频的“加入其他……”放在列表末尾的操作行，不与主任务争夺标题区；
- 空状态中的下一步使用内容区完整主按钮，不同时保留标题区主按钮；
- 表单提交继续使用内容底部完整主按钮，危险操作继续使用明确的危险按钮。

预约可用性与确认流程遵循：

- 选定预约项目后，展示查询范围内所有用户可见时段；不可预约时段保留在原日期位置，置灰并使用文字状态标注，不能只靠隐藏表达不可用；
- 时间列表优先展示日期、开始和结束时间，不使用“时段”等无信息量的占位文案；
- 打开确认弹层所需的预约人等数据应在进入预约页时并行预加载，不在用户点击时段后才发起首次请求；
- 快速切换预约项目时，只允许最后一次时段请求更新页面，避免旧响应覆盖当前选择。

首次进入固定流程：

```text
微信登录
→ 完善资料
→ 加入空间
→ 进入当前空间
```

门禁规则：

- Profile 未完成时进入资料页；
- Profile 完成但没有 active Space Membership 时，只能进入邀请码页；
- 有 active Membership 时恢复上一次可用 Space；
- 上一次 Space 不可用时要求用户选择其他可用 Space；
- “我的”承载资料编辑、当前 Space、Space 切换和加入其他 Space。

Web 与小程序共享**品牌、术语、状态语义和交互原则**，不强求共享同一页面布局。

---

## 8. Accessibility / 可访问性

最低要求：

- 可交互元素使用 button / link 等正确语义。
- Icon-only button 必须提供 `aria-label`。
- Dialog 使用 `role="dialog"` / `aria-modal` 等必要语义。
- 文字和背景保持足够对比。
- 不仅依赖颜色表达成功 / 失败 / 状态。
- 键盘应能操作主要 Admin 流程。
- 表单字段使用可见 Label。

---

## 9. Data and privacy in UI / UI 数据与隐私

本仓库公开。

设计稿、截图、Mock、Fixture、Story/demo data 都只能使用 Synthetic Data。

严禁为了“页面看起来真实”而加入：

- 真实姓名
- 真实生日
- OpenID / UnionID
- 真实邀请码
- 真实邮箱/手机号
- 生产数据截图
- 真实 Cloudflare / 微信基础设施标识

示例邮箱使用 `example.invalid` 等明确不可用域名。

---

## 10. Design implementation discipline / 设计实现纪律

### Source of truth

- 业务语义：`docs/domain-model.md` + `docs/api-contract.md` + `packages/shared`
- UI / UX 规范：本文件 `DESIGN.md`
- 具体页面实现：各 `apps/*`

### Do not

- 不从临时 UI 反推或修改领域模型。
- 不为单个页面复制一套状态枚举。
- 不随意引入大型 UI Library。
- 不直接照搬外部产品 UI、代码或资产。
- 不因 Mock 方便而改变 API Contract。
- 不在每个页面单独定义互不兼容的颜色和间距体系。

### When to update DESIGN.md

以下情况必须同步更新本文件：

- 品牌色或核心 Token 改变
- Admin Shell / Navigation 模式改变
- 形成通用组件模式
- 新增全局交互规范
- Mini Program 视觉基线正式冻结
- 引入 UI Component Library / Design System
- 形成新的 Accessibility / Responsive 基线

重要设计决策同时追加记录到 Notion「99 · 架构演进与决策日志」。

---

## 11. Current status / 当前状态

截至 2026-09-21：

- Web Admin 采用 Current Space 驱动的运营控制台 Shell。
- 导航分为运营、资源配置、空间设置、数据；运营区收敛为“概览 / 预约 / 客户管理”，“预约”内部提供“日历 / 列表”两种视图；空间设置中的后台账号统一称“用户”，使用“用户管理”；“对账”保留入口并标记即将开放。
- 当前 Space 身份与 Space Switcher 统一置于侧边栏顶部，并替代固定“Yu言在线”品牌标题；当前用户身份与退出登录保留在侧边栏底部。
- Web Admin 同时具备桌面与移动端响应式基线。
- Space / Settings / Admin / Invite 页面成为首批基准实现。
- 小程序轻量原生工具风格已冻结，并与现有深墨绿品牌体系对齐。
- 小程序已以日程页为基准收敛全局视觉 Token、Surface、列表、按钮、状态与表单模式。
- 当前不引入第三方 UI Component Library。
- Web Admin Design Token System 已收口到 `apps/admin/src/tokens.css`；颜色与通用控件视觉参数不得在页面侧分叉。
- 后续页面优先复用已有 Shell、Button、Panel、Table、Field、Status、Tab 等模式。

本文件随产品发展演进，但必须保持“设计规则先于页面分叉”。
