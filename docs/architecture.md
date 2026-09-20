# Yu言在线架构说明

## 总体原则

Yu言在线采用 Monorepo 管理微信小程序、Web Admin 和 Cloudflare 后端能力。

不使用微信云开发能力，所有运行时能力部署在 Cloudflare 平台。

## 应用层

### apps/miniprogram

- 微信原生小程序
- 面向用户预约场景
- 不依赖微信云开发

### apps/admin

- Vue 3 + Vite + TypeScript
- 面向运营管理
- 部署到 Cloudflare Pages

## 服务层

### services/api

Cloudflare Workers API，按领域拆分：

- auth
- user
- organization
- booking
- notification

## 数据与基础设施

- Cloudflare D1: 业务关系数据
- Cloudflare R2: 文件和资源
- Cloudflare KV: 配置和缓存（按需）
- Cloudflare Queues: 异步任务（按需）

## 部署

- GitHub Actions 负责 CI/CD
- Pages 部署 Web Admin
- Workers 部署 API

## 开源策略

项目采用 AGPL-3.0，要求基于本项目提供网络服务的修改版本保持开源。
