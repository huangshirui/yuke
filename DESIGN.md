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

对外 UI 使用通用预约语言，避免教育行业特定角色词。

| Domain | 中文 UI | English |
|---|---|---|
| Space | 空间 | Space |
| Resource | 预约对象 | Resource |
| Participant | 参与人 | Participant |
| Slot | 可预约时段 / 时段 | Slot |
| Slot Type | 时段类型 | Slot Type |
| Booking | 预约 | Booking |
| User | 用户 | User |
| Space Admin | 空间管理员 | Space Admin |
| Invite Code | 邀请码 | Invite Code |

小程序审核相关页面不要使用“家长 / 学生 / 老师”等行业角色词作为核心业务术语。

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

### 3.2 Current design tokens / 当前设计 Token

当前实现中的核心 Token：

```css
--ink: #17202a;
--muted: #68747f;
--line: #e3e8eb;
--panel: #ffffff;

--accent: #126e62;
--accent-soft: #e8f4f1;

--danger: #b43c3c;

sidebar: #132826;
brand-accent: #d7f26b;
page-background: #f5f7f8;
```

规则：

- 新页面优先复用现有 Token。
- 不应为单一页面随意新增一套品牌色。
- 如果颜色体系发生全局变化，应先更新本文件，再修改页面。
- 状态色必须同时配合文字或图标语义。

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

桌面端：

```text
┌──────────────────────────────────────────────┐
│ Sidebar          │ Topbar                    │
│                  ├───────────────────────────│
│ Primary nav      │ Page heading              │
│                  │                           │
│                  │ Main work area            │
│                  │                           │
└──────────────────────────────────────────────┘
```

当前基线：

- Sidebar：约 232px
- Topbar：约 72px
- Page 最大内容宽度：约 1320px
- Page desktop padding：约 34px
- 主工作区使用 Card / Panel，而不是把每个字段拆成单独卡片

### 4.2 Page hierarchy

标准页面顺序：

1. Page heading
2. Primary action
3. Optional summary / metrics
4. Main panel / table / form
5. Contextual detail / drawer / sub-panel

不要把次要说明放在主操作之前。

---

## 5. Components / 组件原则

### Buttons

- Primary：一个局部操作区域通常只有一个主按钮。
- Secondary / Ghost：普通操作。
- Danger：撤销、删除语义、停用等高风险操作。
- Link button：查看详情、进入关联数据等轻量导航。

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
- 内部 ID 可显示为次级信息或 monospace，不应抢占主视觉。
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

### Modals

适合：

- 新建轻量实体
- 简短确认
- 不需要大量上下文的编辑

复杂配置应进入独立页面或 Panel，不堆进大 Modal。

---

## 6. Interaction states / 交互状态

每个异步操作至少考虑：

- Loading
- Success
- Empty
- Error
- Disabled / unavailable

原则：

- 保存期间阻止重复提交。
- 操作成功提供短反馈。
- API Error 使用用户能理解的中文提示。
- 冲突类错误应解释下一步，不直接展示数据库异常。
- 不通过刷新整页来掩盖状态管理问题。

典型例子：

```text
SLOT_ALREADY_BOOKED
→ 这个时间刚刚被预约了，请选择其他时间。
```

---

## 7. Responsive behavior / 响应式

### Web Admin

Admin 为桌面优先。

窄屏：

- Sidebar 可转为顶部/横向导航。
- 表格允许横向滚动。
- 双列表单转单列。
- Header 操作在必要时换行。
- 不因为移动端而删除重要功能。

当前参考断点约为：

```css
@media (max-width: 820px)
```

未来如统一断点体系，应在本文件更新。

### Mini Program

小程序采用移动端原生交互，重点：

- 单手操作
- 清晰的点击目标
- 预约路径短
- 状态和时间信息优先
- 不照搬 Web Admin 的 Sidebar / Table 模式

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

截至 2026-09-20：

- Web Admin 视觉方向已确认。
- Space / Settings / Admin / Invite 页面成为首批基准实现。
- 小程序产品交互已定义，但完整视觉系统尚未冻结。
- 当前不引入第三方 UI Component Library。
- 后续页面优先复用已有 Shell、Button、Panel、Table、Field、Status、Tab 等模式。

本文件随产品发展演进，但必须保持“设计规则先于页面分叉”。
