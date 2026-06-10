"use client";

interface Props {
  /** Optional title — when omitted, shows TACO logo. */
  title?: string;
  /** Optional right slot (e.g. a back link). */
  right?: React.ReactNode;
}

// NOTE: the region/"Wilayah ASM" badge that used to live in the default right
// slot was removed per KC — he doesn't want the region shown in the header on
// any screen. The region is still surfaced where it belongs (the Profil screen
// body field). `right` is still honored for genuine header actions.
export function TopBar({ title, right }: Props) {
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
        {right}
      </div>
    </div>
  );
}
