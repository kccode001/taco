"use client";

import { usePathname } from "next/navigation";
import { TaroDashboardLayout } from "@/components/TaroDashboardLayout";

export default function TaroLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // The v2 management surface (`/taro/v2/*`) supplies its OWN sidebar shell
  // (`V2DashboardLayout`), so pass it straight through here to avoid stacking a
  // second sidebar. v1 routes keep the original TaroDashboardLayout untouched.
  if (pathname?.startsWith("/taro/v2")) {
    return <>{children}</>;
  }

  return (
    <TaroDashboardLayout>
      <div className="p-6">{children}</div>
    </TaroDashboardLayout>
  );
}
