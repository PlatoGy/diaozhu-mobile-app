export function PlayerRemainingCard({ count }: { count: number }) {
  return (
    <div className="grid h-8 w-6 shrink-0 place-items-center">
      <div className="grid h-6 w-5 place-items-center rounded border border-[#f5d38a] bg-[radial-gradient(circle_at_30%_30%,#1f7a4f,#0c3827_68%)] text-[10px] font-bold leading-none text-[#f5d38a] shadow-sm">
        {count}
      </div>
    </div>
  );
}
