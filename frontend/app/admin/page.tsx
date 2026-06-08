"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** /admin lands on Sales Staff. The layout owns role-gate + inner sidebar. */
export default function AdminLanding() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/sales-staff");
  }, [router]);

  return (
    <div className="text-[14px] text-taco-sub">Membuka panel admin…</div>
  );
}
