# Yu言在线工程协作规范

Yu言在线是一个公开开源（Public Open-source）的微信小程序 + Web Admin + Cloudflare 后端 Monorepo。本文适用于所有 Human / AI Contributor（人类 / AI 贡献者）。

## 修改前必须阅读

修改代码前至少阅读：

1. 本文件 `AGENTS.md`；
2. 根目录 `README.md`；
3. `docs/architecture.md`；
4. 与修改目录相关的 README、Contract、Schema 与测试。

重要架构、产品和工程决策必须**追加**记录到 Notion 项目页的「99 · 架构演进与决策日志」。如该子页不存在，应先创建。

## 已确认技术边界

- Monorepo：pnpm workspace。
- 微信小程序：微信原生。
- Web Admin：Vue 3 + Vite + TypeScript。
- Backend：Cloudflare Workers，并按领域组织。
- 数据与边缘能力：优先 Cloudflare D1 / R2 / KV / Queues 等免费资源。
- **不使用微信云开发平台能力**；不得引入 `wx.cloud`、云函数、云数据库作为项目后端依赖。
- 小程序与 Web 通过公开定义的 HTTPS API / Contract 使用 Cloudflare 后端能力。
- 业务模型和数据库 Schema 必须在需求确认后再固化；不要从临时 UI 反推长期领域模型。

## Open-source and public-repository safety（公开仓库安全）

将每个被追踪的文件、Commit、Branch、Pull Request、Issue、Review Comment、CI Log / Artifact、Screenshot、Fixture、生成示例和文档片段，都视为可能被公开、永久索引并长期保留。

不得 Commit、粘贴、生成、快照、记录日志或作为测试数据暴露：

- 真实家长、学生、老师的姓名、手机号、生日、备注、预约记录、OpenID / UnionID、会话数据或其他个人信息；
- Production / Staging 数据、数据库 Dump、真实 Request / Response Capture、Trace 或 Log；
- 微信 AppSecret / session_key / Access Token，Cloudflare API Token，以及其他 API Key、OAuth Secret / Token、Cookie、JWT、Private Key、Password、Webhook Secret、Recovery Code、Signed URL；
- 非公开基础设施标识 / 拓扑，例如 Cloudflare Account / Zone / Resource / Tunnel ID、Origin IP、Private Host / Route、数据库连接串或内部服务元数据；
- 从 Private Connector、Notion 私有页面、私有仓库或其他系统读取到的非公开内容。

示例和测试只能使用 Synthetic Data（合成数据）与明显的安全占位符。Runtime Secret 和线上私密配置必须通过 GitHub / Cloudflare / 微信平台的 Secret、Environment 或 Binding 机制注入，不得进入 Git 历史。

如发现敏感信息已经进入仓库：立即停止传播；必要时先撤销 / 轮换凭据；默认 Git 历史仍存在，直到明确完成历史清理；同时检查 CI Log / Artifact、PR / Issue 和外部缓存。

## Licensing and third-party material（许可与第三方材料）

- 本仓库采用 **GNU Affero General Public License v3.0 or later（AGPL-3.0-or-later）**。
- 未经项目所有者明确同意，不得改变许可策略。
- 引入第三方代码、Schema、Prompt、图片、字体、图标、文档或其他资产前，必须核验 License / Attribution；公开可访问不等于可自由复用。

## Repository discipline（仓库纪律）

- `apps/miniprogram`：微信原生小程序。
- `apps/admin`：Vue Web Admin。
- `services/api`：Cloudflare Workers API 与领域实现。
- `packages/shared`：跨端共享 Contract / Type / Utility。
- `packages/config`：共享工程配置。
- `docs`：稳定需求、架构与工程文档。

领域语义应在共享 Contract 和后端领域层形成单一事实源；小程序与 Web 不应各自复制并分叉同一套业务规则。

## Change completion（变更完成标准）

宣布变更完成前：

- 检查相关文档、Contract、实现、测试与部署配置是否一致；
- 至少运行仓库规定的 CI / Check；无法运行时必须明确说明；
- 对 Diff 执行 Public-repository Safety Pass；
- 确认示例数据全部为 Synthetic Data；
- 重要决策已追加记录到 Notion「99 · 架构演进与决策日志」。
