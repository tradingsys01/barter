"use client";

type Area = { id: string; name: string; slug: string };

type Props = {
  areas: Area[];
  defaultValues?: {
    route_from?: string;
    route_to?: string;
    schedule?: string;
    seats?: number;
    gas_share?: boolean;
  };
  show: boolean;
};

export function RideFields({ areas, defaultValues, show }: Props) {
  if (!show) return <input type="hidden" name="is_ride" value="false" />;

  return (
    <>
      <input type="hidden" name="is_ride" value="true" />

      <div className="space-y-6 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
        <p className="text-sm text-emerald-800">
          <strong>Tip:</strong> Example: &quot;I drive from Bold Point to the ferry Mon-Fri at 7am, returning at 4pm. 3 seats available. Gas share appreciated or happy to barter.&quot;
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="route_from" className="block text-sm font-medium text-zinc-700">
              From
            </label>
            <select
              id="route_from"
              name="route_from"
              required
              defaultValue={defaultValues?.route_from ?? ""}
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">Pick starting point…</option>
              {areas.map((a) => (
                <option key={a.slug} value={a.slug}>{a.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="route_to" className="block text-sm font-medium text-zinc-700">
              To
            </label>
            <select
              id="route_to"
              name="route_to"
              required
              defaultValue={defaultValues?.route_to ?? ""}
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">Pick destination…</option>
              {areas.map((a) => (
                <option key={a.slug} value={a.slug}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="schedule" className="block text-sm font-medium text-zinc-700">
            Schedule
          </label>
          <input
            id="schedule"
            name="schedule"
            required
            maxLength={200}
            defaultValue={defaultValues?.schedule ?? ""}
            placeholder="Mon-Fri 7am out, 4pm return"
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="seats" className="block text-sm font-medium text-zinc-700">
              Seats available
            </label>
            <input
              id="seats"
              name="seats"
              type="number"
              required
              min={1}
              max={6}
              defaultValue={defaultValues?.seats ?? 3}
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div className="flex items-center gap-3 pt-7">
            <input
              id="gas_share"
              name="gas_share"
              type="checkbox"
              defaultChecked={defaultValues?.gas_share ?? false}
              className="h-5 w-5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="gas_share" className="text-sm font-medium text-zinc-700">
              Gas share welcome
            </label>
          </div>
        </div>
      </div>
    </>
  );
}
