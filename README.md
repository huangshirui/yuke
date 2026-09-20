# Yu言在线 (YuYan Online)

> 微信小程序 + Web Admin + Cloudflare Backend 的开源 Monorepo 项目。

## 项目结构

```
.
├── apps/
│   ├── miniprogram/      # 微信小程序
│   └── admin/            # Web Admin 管理端
├── services/
│   └── api/              # Cloudflare Workers API 服务
├── packages/
│   ├── shared/           # 通用类型与工具
│   └── config/           # 工程配置
├── docs/                 # 项目文档
└── .github/              # CI/CD 配置
```

## 技术方向

- 微信小程序：微信原生能力优先
- Web Admin：现代 Web 技术栈
- Backend：Cloudflare Workers / D1 / R2
- Monorepo：pnpm workspace

## 开发

```bash
pnpm install
pnpm dev
```

## License

MIT
