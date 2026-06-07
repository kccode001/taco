import { SinyalLevel } from "./types";

const LEVELS: { slug: SinyalLevel; label: string; dot: string }[] = [
  { slug: "sangat_positif", label: "Sangat Positif", dot: "#1D9E75" },
  { slug: "positif", label: "Positif", dot: "#1D9E75" },
  { slug: "netral", label: "Netral", dot: "#ADADAD" },
  { slug: "kurang_puas", label: "Kurang Puas", dot: "#E07B00" },
  { slug: "negatif", label: "Negatif", dot: "#D0342C" },
];

const SELECTED_STYLES: Record<SinyalLevel, { bg: string; color: string; border: string }> = {
  sangat_positif: { bg: "#E6F7F2", color: "#1D9E75", border: "#1D9E75" },
  positif: { bg: "#E6F7F2", color: "#1D9E75", border: "#1D9E75" },
  netral: { bg: "#F0F0F0", color: "#717171", border: "#ADADAD" },
  kurang_puas: { bg: "#FFF3E6", color: "#E07B00", border: "#E07B00" },
  negatif: { bg: "#FEE2E2", color: "#D0342C", border: "#D0342C" },
};

interface SentimenLegendProps {
  selected?: SinyalLevel;
}

export function SentimenLegend({ selected }: SentimenLegendProps) {
  return (
    <div
      data-testid="sentimen-legend"
      className="flex gap-1.5 flex-wrap"
    >
      {LEVELS.map((lvl) => {
        const isSelected = selected === lvl.slug;
        const sel = SELECTED_STYLES[lvl.slug];
        return (
          <span
            key={lvl.slug}
            data-testid={`sentimen-chip-${lvl.slug}`}
            data-selected={isSelected ? "true" : "false"}
            className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[11px]"
            style={
              isSelected
                ? {
                    background: sel.bg,
                    color: sel.color,
                    border: `1.5px solid ${sel.border}`,
                    fontWeight: 700,
                  }
                : {
                    background: "#F7F7F7",
                    color: "#717171",
                    border: "1px solid #E5E5E5",
                    fontWeight: 600,
                  }
            }
          >
            <span
              className="inline-block rounded-full"
              style={{ width: 8, height: 8, background: lvl.dot }}
              aria-hidden
            />
            {lvl.label}
            {isSelected ? " ✓" : ""}
          </span>
        );
      })}
    </div>
  );
}

export function sentimenLabel(level?: SinyalLevel): string {
  return LEVELS.find((l) => l.slug === level)?.label ?? "—";
}
