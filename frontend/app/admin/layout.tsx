"use client";

import { DashboardLayout } from "@/components/DashboardLayout";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout>
      <div className="p-6">{children}</div>
    </DashboardLayout>
  );
}
