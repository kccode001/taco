"use client";

import { useAuthStore } from "@/lib/store";

interface Props {
  /** Optional title — when omitted, shows TACO logo. */
  title?: string;
  /** Hide the region badge (e.g. on profile screen). */
  hideRegion?: boolean;
  /** Optional right slot (e.g. a back link). */
  right?: React.ReactNode;
}

export function TopBar({ title, hideRegion, right }: Props) {
  const user = useAuthStore((s) => s.user);
  const regionDisplay = user?.region_display ?? user?.region_code;
  return (
    <div className="bg-white border-b border-taco-divider sticky top-0 z-10">
      <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          {title ? (
            <div className="text-[17px] font-semibold text-taco-text truncate">
              {title}
            </div>
          ) : (
            <img
              src="https://manage.taco.co.id/asset-images/logo.svg"
              alt="TACO"
              className="h-[22px]"
            />
          )}
        </div>
        {right ?? (
          <div className="flex items-center gap-2 min-w-0 flex-shrink">
            {!hideRegion && regionDisplay && (
              <span className="inline-flex items-center text-[11px] font-medium px-2 py-1 rounded-full bg-taco-page text-taco-sub border border-taco-border truncate max-w-[180px]">
                {regionDisplay}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
