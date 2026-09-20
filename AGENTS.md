# Yu言在线工程协作规范

## 项目说明
Yu言在线（Yu言在线）是一个微信小程序 + Web Admin + Cloudflare 后端项目。

## 代码约定
- 使用 Monorepo 管理 apps、packages、services。
- 修改代码前先阅读本文件。
- 重要架构和工程决策需要同步记录到 Notion 项目的「99 · 架构演进与决策日志」。
- 中文文档优先，必要时补充英文。

## 技术方向
- 小程序：微信原生或适配层。
- Web Admin：现代 Web 技术栈。
- Backend：Cloudflare Workers / D1 / R2 等边缘能力。
