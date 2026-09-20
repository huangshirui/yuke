# Yu言在线架构说明

## 初始架构

```
微信小程序
    |
Web Admin
    |
Cloudflare Workers API
    |
D1 / R2
```

## 设计原则

- 前端应用与后端能力解耦
- 共享模型优先
- Cloudflare Edge First
- 为后续 AI Agent 能力预留扩展空间
