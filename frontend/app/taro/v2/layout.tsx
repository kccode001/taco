import { V2DashboardLayout } from "./_components/V2DashboardLayout";

/** v2 management-surface shell. Supplies its OWN v1-style sidebar
 *  (`V2DashboardLayout`) instead of borrowing the v1 `app/taro` sidebar — the
 *  parent `app/taro/layout.tsx` passes v2 routes through untouched so there is
 *  exactly one sidebar, scoped to the v2 nav. */
export default function V2Layout({ children }: { children: React.ReactNode }) {
  return <V2DashboardLayout>{children}</V2DashboardLayout>;
}
