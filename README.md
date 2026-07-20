# 吊主在线牌桌

Next.js App Router、TypeScript、Tailwind CSS、Neon PostgreSQL 和 WebSocket 单实例实时同步实现。

## 开发启动

```bash
npm run dev
```

该命令通过 `tsx server.ts` 启动 Next.js custom Node server，同时处理：

- Next.js HTTP 请求
- `/ws` WebSocket upgrade
- 房间连接管理和状态变化广播

打开：

```text
http://localhost:3000
```

## 生产构建与启动

```bash
npm run build
npm run start
```

`npm run start` 同样通过 custom server 启动，而不是 `next start`。

## 环境变量

至少需要：

```text
DATABASE_URL=
ADMIN_SECRET=
NEXT_PUBLIC_WS_URL=
```

`NEXT_PUBLIC_WS_URL` 可选。浏览器默认会根据当前页面 origin 自动推导：

```text
http -> ws
https -> wss
```

生产环境不要硬编码 `localhost`。

## 数据库

Neon PostgreSQL 是唯一权威状态来源。需要执行：

```bash
source .env.local && psql "$DATABASE_URL" -f database/001_initial.sql
source .env.local && psql "$DATABASE_URL" -f database/002_game_action_requests.sql
```

## WebSocket 部署约束

当前 WebSocket 房间广播以单个 Node.js 实例运行，房间连接 Map 保存在进程内。

Neon 保存权威 `GameState`。如未来部署多个应用实例，需要增加 Redis Pub/Sub 或其他跨实例消息总线。本阶段不实现 Redis 或多实例同步。
