export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="inline-flex items-center justify-center rounded-md bg-brand text-white font-bold tabular-nums"
        style={{ width: size, height: size, fontSize: size * 0.55 }}
        aria-hidden
      >
        B
      </span>
      <span className="font-semibold tracking-tight text-slate-900 dark:text-slate-50">
        Below <span className="text-brand dark:text-brand-dark">OP</span>
      </span>
    </span>
  );
}
