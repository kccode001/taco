import { ProductLine, StockLevel } from "./types";

interface StockLevelGridProps {
  values?: Partial<Record<ProductLine, StockLevel>>;
}

const ROWS: { slug: ProductLine; label: string }[] = [
  { slug: "taco_hpl", label: "TACO HPL" },
  { slug: "tiero", label: "TIero" },
  { slug: "eco_hpl", label: "ECO HPL" },
  { slug: "taco_sheet", label: "TACO Sheet" },
  { slug: "taco_edging", label: "TACO Edging" },
  { slug: "taco_hardware", label: "TACO Hardware" },
  { slug: "vinyl", label: "Vinyl" },
  { slug: "fideco", label: "FIDECO" },
];

function chipFor(level: StockLevel) {
  if (level === "minimum") {
    return (
      <span className="inline-flex items-center h-6 px-2 rounded text-[11px] font-semibold bg-red-100 text-red-700">
        Sangat Minimum
      </span>
    );
  }
  if (level === "cukup") {
    return (
      <span className="inline-flex items-center h-6 px-2 rounded text-[11px] font-semibold bg-emerald-50 text-taco-success">
        Stock Cukup
      </span>
    );
  }
  if (level === "besar") {
    return (
      <span className="inline-flex items-center h-6 px-2 rounded text-[11px] font-semibold bg-blue-50 text-taco-info">
        Sangat Besar
      </span>
    );
  }
  return (
    <span className="inline-flex items-center h-6 px-2 rounded text-[11px] font-semibold bg-white text-taco-muted border border-taco-border">
      —
    </span>
  );
}

export function StockLevelGrid({ values }: StockLevelGridProps) {
  return (
    <div data-testid="stock-level-grid">
      <div className="text-[13px] font-semibold text-taco-text mb-2">
        Level Stok per Kategori (8)
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {ROWS.map((row) => (
          <div
            key={row.slug}
            data-testid={`stock-row-${row.slug}`}
            className="flex justify-between items-center px-2.5 py-1.5 bg-taco-page rounded-md"
          >
            <span className="text-[12px] text-taco-sub">{row.label}</span>
            {chipFor(values?.[row.slug] ?? null)}
          </div>
        ))}
      </div>
    </div>
  );
}
