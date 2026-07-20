import type { TeamPresentation } from "@/src/lib/game/table-layout";

export function TeamBadge({ team }: { team: TeamPresentation }) {
  return (
    <span
      className={[
        "inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-semibold leading-none",
        team.badgeClassName,
      ].join(" ")}
    >
      {team.label}
    </span>
  );
}
