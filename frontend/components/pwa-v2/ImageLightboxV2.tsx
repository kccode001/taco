"use client";

import { useEffect, useRef } from "react";
import { CloseIcon } from "@/app/taro-app/_components/icons";

/** Full-screen invoice-photo preview for the v2 PWA. Mirrors the v1 review
 *  lightbox: dismiss via backdrop tap, the X button, Esc, or the device back
 *  gesture (one pushed history entry, made idempotent so it survives StrictMode
 *  and re-opens). Body scroll is locked while open; the image is object-contain
 *  so the full invoice stays legible, and the scroll container allows pinch-zoom. */
export function ImageLightboxV2({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!window.history.state?.tacoV2Lightbox) {
      window.history.pushState(
        { ...window.history.state, tacoV2Lightbox: true },
        ""
      );
    }
    const onPop = () => onCloseRef.current();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/90 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Foto invoice"
      onClick={() => onClose()}
    >
      <div className="flex justify-end px-3 pt-3 pb-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Tutup"
          className="w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center active:bg-white/20"
        >
          <CloseIcon size={22} />
        </button>
      </div>
      <div
        className="flex-1 overflow-auto flex items-center justify-center p-3"
        style={{ touchAction: "pinch-zoom" }}
      >
        {/* Tapping the image must not dismiss; only the backdrop does. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Foto invoice penuh"
          onClick={(e) => e.stopPropagation()}
          className="max-w-full max-h-full object-contain select-none"
        />
      </div>
    </div>
  );
}
