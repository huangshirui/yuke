# Yu言在线 (YuYan Online)

> 微信原生小程序 + Vue Web Admin + Cloudflare Backend 的开源 Monorepo。

## 项目结构

```text
.
├── apps/
│   ├── miniprogram/      # 微信原生小程序
│   └── admin/            # Vue 3 + Vite + TypeScript Web Admin
├── services/
│   └── api/              # Cloudflare Workers API
├── packages/
│   ├── shared/           # 通用 Contract / Type / Utility
│   └── config/           # 工程配置
├── docs/                 # 项目文档
└── .github/              # CI / Security / Repository automation
```

## 技术基线

- 微信小程序：微信原生
- Web Admin：Vue 3 + Vite + TypeScript
- Backend：Cloudflare Workers，领域化组织
- Data / Edge：Cloudflare D1 / R2 / KV / Queues（按实际需求启用）
- Monorepo：pnpm workspace
- Runtime：Node.js 22
- License：AGPL-3.0-or-later

本项目**不使用微信云开发平台**。小程序和 Web 统一通过 HTTPS API 使用部署在 Cloudflare 上的后端能力。

## 开发

```bash
pnpm install
pnpm build
pnpm test
```

## 公开仓库安全

这是公开仓库。不要提交真实用户数据、微信 / Cloudflare 凭据、生产日志、数据库导出或非公开基础设施标识。测试和示例只能使用 Synthetic Data（合成数据）。

安全问题请阅读 [SECURITY.md](SECURITY.md)，贡献规范请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

GNU Affero General Public License v3.0 or later — **AGPL-3.0-or-later**。完整条款见 [LICENSE](LICENSE)。
