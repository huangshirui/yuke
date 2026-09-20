# Contributing to Yu言在线（参与贡献）

感谢参与 Yu言在线。该项目是 Human + AI（人类 + AI）共同维护的公开开源项目，因此业务一致性、可审计性、隐私与基础设施安全都属于贡献质量的一部分。

## Before you start（开始前）

请先阅读：

1. `AGENTS.md`：仓库协作与公开仓库强制规则；
2. `README.md`：项目定位与当前技术栈；
3. `docs/architecture.md`：系统与仓库架构边界；
4. 与修改相关的其他文档、Contract、Schema 与测试。

修改业务语义前，先确认需求已经在项目需求文档中达成一致。未经确认的业务模型不要提前固化为公共 API、数据库 Schema 或领域不变量。

## Public repository safety（公开仓库安全）

只提交适合永久公开的内容。

- 使用 Synthetic Data，不得使用真实用户数据作为 Fixture / Example。
- 不提交 Secret / Credential、`.env`、真实 Token、Cookie、Private Key、Signed URL 或线上数据库连接串。
- 不提交真实用户内容、生产 / 预发布数据、日志、Trace、Request Capture 或私有 Connector 输出。
- 不提交非公开基础设施标识、Origin IP、Private Hostname、Tunnel / Account / Resource ID 等。
- 第三方代码、Schema、Prompt、图像、图标、字体或大段文本必须先确认 License / Attribution。

敏感安全问题按照 `SECURITY.md` 私密报告，不要在公开 Issue / PR 中披露。

## Change approach（修改方式）

1. 明确需要改变的需求、Contract 或不变量；
2. 必要时先或同步更新文档；
3. 更新共享类型 / Contract；
4. 更新实现；
5. 添加或更新测试；
6. 检查小程序、Web Admin、API 和 Cloudflare 配置是否保持一致；
7. 对重要架构、产品和工程决策追加记录到 Notion 项目页的「99 · 架构演进与决策日志」。

不要为了未来可能的需求提前建立大型抽象层。

## Pull Request（拉取请求）

PR 应保持聚焦，并清楚说明：

- 改了什么、为什么；
- 是否改变业务语义、API Contract 或数据模型；
- 更新了哪些文档 / 测试；
- 执行了哪些检查；
- 是否存在尚未验证的行为或迁移影响；
- Public-repository Safety Pass 是否完成。

默认分支 `main` 应通过 Repository Ruleset 保护，使用 PR、通过必要 CI、解决 Review Conversation，并优先使用 Squash Merge 保持简洁历史。

## License（许可）

除非文件明确声明其他兼容许可，本仓库贡献按照 **GNU Affero General Public License v3.0 or later（AGPL-3.0-or-later）** 提交。提交贡献即表示你有权按该许可提供这些内容。
