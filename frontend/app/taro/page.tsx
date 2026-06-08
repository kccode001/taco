"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** /taro lands on the dashboard overview. */
export default function TaroLanding() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/taro/dashboard");
  }, [router]);

  return (
    <div className="text-[14px] text-taco-sub">Membuka Taro Dashboard…</div>
  );
}
