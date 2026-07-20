export function PortraitOrientationOverlay() {
  return (
    <div className="fixed inset-0 z-50 hidden place-items-center bg-[#0b3027] p-8 text-center text-white portrait:grid">
      <div>
        <div className="mx-auto mb-4 grid h-16 w-10 rotate-90 place-items-center rounded-xl border-2 border-white/60 text-2xl">
          ↻
        </div>
        <p className="text-xl font-semibold">请将手机横过来</p>
      </div>
    </div>
  );
}
