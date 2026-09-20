# Yu言在线微信小程序

微信原生小程序，面向通用预约用户。

## MVP 范围

- 微信登录与项目用户身份
- 头像 / 昵称初始化与编辑
- 邀请码加入空间
- 无 Space Membership 时的进入门禁
- 多空间切换
- 参与人、预约对象、时段与预约能力（后续 Phase）

小程序不使用微信云开发，统一通过 Cloudflare Worker HTTPS API 使用后端能力。

## Design

全局设计基线见仓库根目录 [DESIGN.md](../../DESIGN.md)。

小程序采用轻量、原生感的通用工具风格，并统一使用“用户 / 空间 / 参与人 / 预约对象 / 时段 / 预约”等通用术语。

## #18 开发模式

#18 页面在 Phase 1 Membership API 合并前使用 `config.js` 中的 `mock` 模式，以 Synthetic Data 验证进入状态机和页面交互。

后端接口部署可用后切换到 `remote`，并配置正式 HTTPS API Base URL。真实凭据和非公开基础设施标识不得进入仓库。
