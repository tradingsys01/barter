export function SearchBar({ defaultValue }: { defaultValue?: string }) {
  return (
    <form method="GET" action="/" className="w-full">
      <input
        type="search"
        name="q"
        defaultValue={defaultValue ?? ""}
        placeholder="Search listings…"
        className="w-full rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        aria-label="Search listings"
      />
    </form>
  );
}
