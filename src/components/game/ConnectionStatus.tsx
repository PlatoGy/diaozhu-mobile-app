import type { SocketConnectionStatus } from "@/src/lib/client/use-game-room-socket";

const CONNECTION_LABELS: Record<SocketConnectionStatus, string> = {
  connecting: "连接中",
  connected: "正常",
  reconnecting: "重连中",
  disconnected: "已断开",
  error: "连接异常",
};

const CONNECTION_DOT: Record<SocketConnectionStatus, string> = {
  connecting: "bg-[#fdb022]",
  connected: "bg-[#12b76a]",
  reconnecting: "bg-[#fdb022]",
  disconnected: "bg-[#98a2b3]",
  error: "bg-[#f04438]",
};

export function connectionStatusLabel(status: SocketConnectionStatus): string {
  return CONNECTION_LABELS[status];
}

export function ConnectionStatus({ status }: { status: SocketConnectionStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] text-[#e4f0df]">
      <span className={["h-2 w-2 rounded-full", CONNECTION_DOT[status]].join(" ")} />
      {CONNECTION_LABELS[status]}
    </span>
  );
}
