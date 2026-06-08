"use client";

import { TopBar } from "../_components/TopBar";
import { BottomNav } from "../_components/BottomNav";
import { useTaroGuard } from "../_components/useTaroGuard";
import { BellIcon } from "../_components/icons";

export default function TaroNotificationsPage() {
  const { ready } = useTaroGuard();

  if (!ready) {
    return (
      <div className="min-h-screen bg-taco-page flex items-center justify-center text-[13px] text-taco-muted">
        Memuat…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[96px]">
        <TopBar title="Notifikasi" />

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-white border border-taco-border flex items-center justify-center text-taco-muted mb-4">
            <BellIcon size={28} />
          </div>
          <div className="text-[16px] font-semibold text-taco-text">
            Belum ada notifikasi
          </div>
          <div className="text-[13px] text-taco-sub mt-1 max-w-[260px] leading-relaxed">
            Notifikasi tentang upload, hasil OCR, dan koreksi akan muncul di sini.
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
