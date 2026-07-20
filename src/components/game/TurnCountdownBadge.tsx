export function TurnCountdownBadge({
  seconds,
  size = "normal",
}: {
  seconds: number;
  size?: "compact" | "normal";
}) {
  const containerClassName = size === "compact" ? "h-10 w-10" : "h-14 w-14";
  const textClassName = size === "compact" ? "text-sm" : "text-base";

  return (
    <div
      aria-label={`倒计时 ${seconds} 秒`}
      className={["relative shrink-0", containerClassName].join(" ")}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full bg-white bg-[url('/game/alarm-clock.png')] bg-contain bg-center bg-no-repeat shadow-[0_4px_12px_rgba(0,0,0,0.18)]"
      />
      <span
        className={[
          "absolute inset-0 grid place-items-center font-black leading-none text-black",
          textClassName,
        ].join(" ")}
      >
        <span className="tabular-nums">{seconds}</span>
      </span>
    </div>
  );
}
