# Yu言在线架构说明

## 总体原则

Yu言在线采用 Monorepo 管理微信小程序、Web Admin 和 Cloudflare 后端能力。

不使用微信云开发能力，所有运行时能力部署在 Cloudflare 平台。

MVP 领域需求已经冻结，稳定领域模型见 [domain-model.md](domain-model.md)，HTTP Contract 见 [api-contract.md](api-contract.md)。

## 应用层

### apps/miniprogram

- 微信原生小程序
- 面向通用预约用户
- 不依赖微信云开发
- 通过 HTTPS API 使用 Cloudflare 后端
- 头像上传前由客户端压缩

### apps/admin

- Vue 3 + Vite + TypeScript
- 面向 Super Admin / Space Admin
- 使用 Cloudflare Access 登录，MVP 为邮箱 OTP
- 部署到独立的 Cloudflare Worker Static Assets + Gateway（`yuke-admin`）
- 浏览器统一请求同源 `/api/*`；`yuke-admin` 通过 Service Binding 内部调用 `yuke-api`

## 服务层

### services/api

Cloudflare Workers API，按领域拆分：

- identity
- tenant
- resource
- reservation

领域规则不分叉到小程序/Web；跨端 Contract 由 `packages/shared` 提供。

## 数据与基础设施

### Cloudflare D1

MVP 使用单个 D1 数据库：

- 所有业务记录显式携带 `space_id`
- Space 通过授权、复合外键和查询条件实现租户隔离
- capacity=1 由 partial unique index 最终保证
- Resource Slot 不重叠由 SQLite Trigger 最终保证
- 预约并发不能只依赖“先查再写”

D1 使用 SQLite 语义和外键。首版 Schema 位于：

`services/api/migrations/0001_initial.sql`

### Cloudflare R2

用于用户头像等对象资源。

仓库只保存 Object Key / Contract，不保存真实用户文件。

### Cloudflare KV / Queues

MVP 暂不作为核心业务一致性数据源；后续按缓存、异步任务需求启用。

## 时间与周期

- Space 持有 IANA timezone。
- 具体 Slot 保存 UTC epoch milliseconds。
- 周期规则保存 Space 本地日期/时间。
- Booking 永远指向具体 Slot。
- 周期 Series 通过日期范围按需、幂等物化为具体 Slot；MVP 不依赖后台 Cron 才能工作。
- “本次及之后”通过 split series 实现；“仅本次”通过 series exception 实现。

## 认证

### 小程序

`wx.login` -> Worker 服务端调用微信 `code2Session` -> OpenID 映射项目 User -> 24 小时 HMAC-SHA256 项目 Bearer Token。

- 微信 AppID / AppSecret 与 Token 签名 Secret 由运行时环境提供，不进入仓库；
- 微信 `session_key` 不持久化、不记录日志、不回传；
- Token payload 只包含项目 User ID 与签发/过期时间；
- 每次认证请求仍回查 User active 状态，因此停用用户立即失效；
- 用户头像保存到私有 R2，D1 仅保存 object key。

### Web Admin

Cloudflare Access 只保护 `yuke.verinasci.com` 并负责登录认证。Access 注入的 `Cf-Access-Jwt-Assertion` 由 `yuke-admin` Gateway 原样转发给 Service Binding 下游 `yuke-api`；`yuke-api` 继续验证 Access JWT，项目数据库负责 Super Admin / Space Admin 授权。

## API

统一使用 `/v1` 前缀。

- 小程序 API：浏览器外部入口 `https://api.yuke.verinasci.com/v1/*`，使用项目访问令牌
- Admin API：浏览器只访问同源 `https://yuke.verinasci.com/api/v1/admin/*`，由 `yuke-admin` Service Binding 转发到 `yuke-api /v1/admin/*`，使用 Cloudflare Access JWT
- Space 级接口必须服务端重新验证 Space Scope
- API 错误使用稳定 error code，前端负责本地化友好文案

## CI / 部署

- GitHub Actions 负责 CI/CD
- Workers Static Assets 部署 Web Admin（独立 `yuke-admin` Worker）
- Workers 部署 API（独立 `yuke-api` Worker）
- D1 Schema 通过 migration 管理

## 开源策略

项目采用 AGPL-3.0-or-later。

公开仓库不得包含真实用户数据、Credential、生产日志、数据库导出、真实 OpenID / UnionID 或非公开基础设施标识。
