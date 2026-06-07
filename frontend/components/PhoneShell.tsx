"use client";

import { cn } from "@/lib/utils";

export function PhoneShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div
        className={cn(
          "phone-shell flex flex-col min-h-screen",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
