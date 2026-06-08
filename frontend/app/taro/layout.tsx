"use client";

import { TaroDashboardLayout } from "@/components/TaroDashboardLayout";

export default function TaroLayout({ children }: { children: React.ReactNode }) {
  return (
    <TaroDashboardLayout>
      <div className="p-6">{children}</div>
    </TaroDashboardLayout>
  );
}
