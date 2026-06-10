"use client";

import { useCallback, useState } from "react";

interface ToastState {
  id: string;
  message: string;
  tone: "ok" | "err";
}

/** Lightweight toast — mirrors the inline pattern in the v1 recommendations
 *  page, extracted so every v2 page shares one implementation. */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const show = useCallback((message: string, tone: "ok" | "err" = "ok") => {
    const id = `t-${Date.now()}`;
    setToast({ id, message, tone });
    window.setTimeout(() => {
      setToast((t) => (t?.id === id ? null : t));
    }, 3500);
  }, []);

  const node = toast ? (
    <div
      role="status"
      className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-[13px] font-medium border ${
        toast.tone === "ok"
          ? "bg-white border-taco-success text-taco-success"
          : "bg-white border-taco-error text-taco-error"
      }`}
    >
      {toast.message}
    </div>
  ) : null;

  return { show, node };
}
