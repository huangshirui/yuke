# Security Policy（安全策略）

Yu言在线是公开开源仓库，并包含微信小程序、Web Admin 与 Cloudflare 后端。安全工作既要保护软件本身，也要保护部署实例可能访问到的用户数据、微信身份信息和线上基础设施。

## Reporting a vulnerability（报告漏洞）

不要在公开 GitHub Issue、Pull Request、Discussion、Commit Message、Review Comment、CI Log 或 Artifact 中放入漏洞利用细节、Credential（凭据）、Personal Data（个人数据）、Production Log（生产日志）、Private Infrastructure Identifier（私有基础设施标识）或其他敏感证据。

如仓库启用了 GitHub Private Vulnerability Reporting（私密漏洞报告），优先使用该渠道。若暂未启用，请先通过项目维护者已有的私密联系方式联系，再分享敏感技术细节。

安全的首轮报告只应说明：受影响组件、影响、复现前置条件，以及使用 Synthetic Data（合成数据）的最小复现；不要包含真实 Secret 或用户数据。

## Repository disclosure boundary（公开仓库披露边界）

公开仓库可以包含可移植源代码、公开 API / Contract / Schema、公开产品与架构文档，以及 Synthetic Example / Fixture（合成示例 / 测试夹具）。

公开仓库不得包含：

- 真实家长、学生、老师的姓名、手机号、生日、备注、预约记录、OpenID / UnionID、会话数据或其他个人信息；
- Production / Staging 数据集、数据库 Dump、Trace、Request Capture 或含真实数据的 Log；
- 微信 AppSecret、session_key、Access Token，Cloudflare API Token，以及任何 API Key、OAuth Secret / Token、Cookie、JWT、Private Key、Password、Webhook Secret、Recovery Code、Signed Private URL；
- 非公开线上基础设施标识或拓扑，例如 Cloudflare Account / Zone / Resource / Tunnel Identifier、Origin IP、Private Host、Deployment-only Route、数据库连接串或内部服务元数据；
- 从 Private Connector、Notion 私有页面、私有仓库或其他系统复制出的非公开内容。

示例、测试和文档只使用 Synthetic Data 与安全占位符。Runtime Secret 和线上私密部署配置必须通过 GitHub / Cloudflare / 微信平台的 Secret、Environment 或 Binding 机制注入，不进入 Git 历史。

## If a disclosure is found（发现泄露时）

1. 立即停止复制、引用或继续传播暴露值。
2. 对受影响 Credential / Token 立即撤销或轮换。
3. 默认已提交内容仍存在于 Git History；普通删除 Commit 不等于清除历史。
4. 如敏感内容进入 Git 历史，完成 History Rewrite / Cleanup 后再认为仓库恢复安全。
5. 检查 CI Log / Artifact、PR / Issue、Review Comment 和外部缓存是否存在二次披露。
6. 记录修复过程时，不要再次写出敏感值。

## Public-release gate（公开发布门禁）

任何准备进入公开仓库的新代码、文档、示例或导入数据，都必须执行 Public-repository Safety Pass（公开仓库安全检查）。不仅检查当前 Working Tree，也要考虑 Git History、CI 日志、Artifact、PR / Issue 文本和自动生成内容。

仓库 CI 使用 Full-history Secret Scan（全 Git 历史密钥扫描）作为基础门禁；GitHub Secret Scanning / Push Protection 也应在仓库设置中启用。

另见 `AGENTS.md` 与 `CONTRIBUTING.md`。
