import { cn } from "@/lib/utils";

type Health = "aktif" | "perlu_update" | "tidak_aktif" | "belum_dikunjungi";

const config: Record<Health, { dot: string; label: string; bg: string; text: string }> = {
  aktif: { dot: "bg-taco-success", label: "Aktif", bg: "bg-emerald-50", text: "text-taco-success" },
  perlu_update: { dot: "bg-taco-warning", label: "Perlu Update", bg: "bg-amber-50", text: "text-taco-warning" },
  tidak_aktif: { dot: "bg-taco-error", label: "Tidak Aktif", bg: "bg-red-50", text: "text-taco-error" },
  belum_dikunjungi: { dot: "bg-taco-muted", label: "Belum Dikunjungi", bg: "bg-taco-page", text: "text-taco-sub" },
};

export function HealthBadge({ health }: { health: Health }) {
  const c = config[health];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-medium", c.bg, c.text)}>
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", c.dot)} />
      {c.label}
    </span>
  );
}

export function HealthDot({ health }: { health: Health }) {
  const dotClass = {
    aktif: "bg-taco-success",
    perlu_update: "bg-taco-warning",
    tidak_aktif: "bg-taco-error",
    belum_dikunjungi: "bg-taco-muted",
  }[health];
  return <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", dotClass)} />;
}
