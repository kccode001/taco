import { V2Tabs } from "./_components/V2Tabs";

/** v2 management-surface layout. Nests INSIDE the v1 `app/taro/layout.tsx`
 *  (which supplies the admin sidebar + page padding), adding only the v2
 *  eyebrow + tab bar. No second sidebar, no v1 mutation. */
export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-taco-accent-tint text-taco-accent text-[11px] font-semibold uppercase tracking-wider">
          v2
        </span>
        <span className="text-[12px] text-taco-muted font-medium uppercase tracking-wider">
          Manajemen
        </span>
      </div>
      <V2Tabs />
      {children}
    </div>
  );
}
