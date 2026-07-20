import { PlayingCard } from "./PlayingCard";

export function PlayerCardBackStack({
  count = 3,
  variant = "mini",
}: {
  count?: 2 | 3 | 4;
  variant?: "mini" | "topStack";
}) {
  return (
    <div className="relative h-11 w-12 shrink-0">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="absolute"
          style={{
            left: index * 5,
            top: index * 2,
            zIndex: index,
          }}
        >
          <PlayingCard faceDown size={variant} />
        </div>
      ))}
    </div>
  );
}
