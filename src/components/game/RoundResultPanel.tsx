import type { RoundResult } from "@/src/lib/game/types";

export function RoundResultPanel({
  result,
  winnerName,
}: {
  result: RoundResult;
  winnerName: string;
}) {
  return (
    <div className="absolute inset-x-[12%] top-1/2 z-10 -translate-y-1/2 rounded-lg border border-[#f8e7a6]/60 bg-[#102c25]/95 p-3 text-xs text-[#f8fff4] shadow">
      <div className="mb-2 text-sm font-semibold">本局结算</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span>获胜队伍</span>
        <strong>{result.winningTeam === "team_0_2" ? "一方" : "二方"}</strong>
        <span>闲家分数</span>
        <strong>{result.defenderScore}</strong>
        <span>贡数</span>
        <strong>{result.tributeCount}</strong>
        <span>最后一墩赢家</span>
        <strong>{winnerName}</strong>
        <span>底牌分</span>
        <strong>{result.bottomPoints}</strong>
        <span>最后一墩倍数</span>
        <strong>×{result.lastTrickMultiplier}</strong>
      </div>
    </div>
  );
}
