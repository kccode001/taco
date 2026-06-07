import { cn } from "@/lib/utils";

interface KpiTileProps {
  label: string;
  value: string | number;
  sub?: string;
  subColor?: "success" | "error" | "muted";
}

export function KpiTile({ label, value, sub, subColor = "muted" }: KpiTileProps) {
  const subColorClass = {
    success: "text-taco-success",
    error: "text-taco-error",
    muted: "text-taco-sub",
  }[subColor];

  return (
    <div className="bg-white border border-taco-border rounded-xl p-5">
      <div className="text-[13px] text-taco-sub mb-2">{label}</div>
      <div className="text-[36px] font-bold text-taco-text leading-none">{value}</div>
      {sub && (
        <div className={cn("text-[13px] mt-1 font-medium", subColorClass)}>
          {sub}
        </div>
      )}
    </div>
  );
}
