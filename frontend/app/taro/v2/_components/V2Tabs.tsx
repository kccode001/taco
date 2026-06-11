/** Shared page header for v2 management sections — title + optional
 *  description + right-aligned actions. (The v2 surface navigates via the
 *  sidebar `V2DashboardLayout`; the old horizontal tab bar was retired in
 *  favour of that sidebar, but this header is still used by every page.) */
export function V2PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
      <div>
        <h1 className="text-[20px] font-bold text-taco-text leading-tight">
          {title}
        </h1>
        {description && (
          <p className="text-[13px] text-taco-sub mt-1 max-w-[640px]">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap">{actions}</div>
      )}
    </div>
  );
}
