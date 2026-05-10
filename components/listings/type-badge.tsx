const LABELS = {
  offer: { label: "Offering", className: "bg-emerald-100 text-emerald-900" },
  want:  { label: "Wanted",   className: "bg-amber-100 text-amber-900" },
} as const;

export function TypeBadge({ type }: { type: keyof typeof LABELS }) {
  const config = LABELS[type] ?? LABELS.offer;
  const { label, className } = config;
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
