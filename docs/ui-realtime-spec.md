# UI 与实时同步规范

本文件固定当前前端与实时同步产品决定。游戏规则仍以 `docs/game-rules.md` 为唯一权威来源。

## 固定产品决定

1. 第一局无人摔 2 时 Seat 0 坐庄。
2. 四名玩家进入房间后分别点击“准备”；四人全部准备后服务端自动开始第一局。
3. 摔出的 2 不从手牌移除，继续保留在手牌中；最高摔 2 信息公开显示到主花色锁定为止。
4. 手牌排序：自来主最前，按牌力从大到小；然后是主花色普通牌；然后是剩余三种花色，按照黑桃、红桃、梅花、方块的循环顺序，从主花色后一种开始。
5. 点击手牌后牌向上移动，再次点击取消选择。
6. 当前玩家始终在底部，搭档在顶部，上家在左侧，下家在右侧。
7. 一墩结算后，桌面出牌保留 1 秒，显示赢家，然后清除。
8. 第一版不做发牌动画，发牌完成后直接显示完整手牌。
9. 本局结算后，所有玩家都能看到“下一局”按钮；任意一名玩家第一次成功点击即可进入下一局准备流程。
10. 界面全部使用中文，牌面使用传统扑克牌风格。
11. 优先适配手机横屏；竖屏时显示“请将手机横过来”遮罩。
12. 正常同步使用 WebSocket，不使用定时轮询。

## WebSocket 架构

本项目使用 Next.js custom Node server、`ws`、现有 App Router 和 Neon 权威状态。WebSocket 路径为：

```text
/ws
```

WebSocket 只用于：

- 通知房间状态已经变化
- 通知客户端重新读取自己的脱敏状态
- 连接状态和心跳

WebSocket 不处理出牌、摔 2、扣底、贡牌、回贡、计分或任何 `GameState` 修改。所有游戏操作必须继续调用：

```text
POST /api/game/[roomId]/action
```

## 鉴权协议

浏览器连接后第一条消息必须是：

```ts
{
  type: "AUTH";
  roomId: string;
  playerToken: string;
}
```

`playerToken` 可以是旧版玩家专属 token，也可以是新版五位房间号。五位房间号前四位为房号，最后一位为玩家座位号 1-4。

成功返回：

```ts
{
  type: "AUTH_OK";
  roomId: string;
  seat: Seat;
  stateVersion: number;
}
```

失败返回：

```ts
{
  type: "ERROR";
  code: "AUTH_FAILED";
  message: "玩家身份验证失败";
}
```

未认证连接不能订阅房间。

## 状态变化广播

HTTP Action 事务成功提交后发布：

```ts
{
  type: "ROOM_STATE_CHANGED";
  roomId: string;
  stateVersion: number;
  actionType: GameActionType;
}
```

广播不得包含完整 `GameState`、任意玩家手牌、底牌、贡牌候选、回贡候选、player token、requestId 或数据库日志。

Action 失败、版本冲突、幂等重复请求都不广播。

## 准备状态

准备状态存入 Neon 权威 `rooms.current_state.readyState`：

```ts
type PlayerReadyState = Record<Seat, boolean>;
```

`SET_READY` 只能在 `waiting_for_players` 阶段调用。第四名玩家准备成功时，服务端在同一个权威操作中初始化第一局并完成发牌，进入 `final_trump_bidding`。

## 牌桌 UI

横屏使用 `100dvw` 和 `100dvh`，考虑安全区。竖屏显示全屏遮罩：

```text
请将手机横过来
```

相对座位：

- bottom = viewerSeat
- top = getPartnerSeat(viewerSeat)
- left = getPreviousSeat(viewerSeat)
- right = getNextSeat(viewerSeat)

其他玩家只显示昵称、Seat、庄家标记、当前出牌者标记、剩余牌数和准备状态，不显示他人手牌。

## 手牌与出牌

手牌显示只使用实体 `card.id` 标识。选择成功 action 后清空；失败时保留，便于修改或重试。

出牌必须由玩家明确选择 `declaredType`：

- 1 张：`single`
- 2 张：`pair` 或 `loose`
- 3 张：`triple` 或 `loose`
- 4 张：`quad` 或 `loose`

首家不能按散牌出。

## 单实例约束

当前 WebSocket 房间广播以单个 Node.js 实例运行。Neon 是权威状态来源。如未来部署多个应用实例，需要增加 Redis Pub/Sub 或其他跨实例消息总线。本阶段不实现 Redis 或多实例 Pub/Sub。
