"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

export function SearchBar({ defaultValue }: { defaultValue?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(defaultValue ?? "");

  // Re-sync if the URL changes externally (e.g. category chip, back/forward).
  useEffect(() => { setValue(defaultValue ?? ""); }, [defaultValue]);

  function navigate(nextQ: string) {
    const next = new URLSearchParams(params.toString());
    const trimmed = nextQ.trim();
    if (trimmed) next.set("q", trimmed);
    else next.delete("q");
    const qs = next.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    navigate(value);
  }

  function onClear() {
    setValue("");
    navigate("");
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div className="relative w-full">
        <input
          type="search"
          name="q"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search listings…"
          className="w-full rounded-full border border-zinc-300 bg-white px-4 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          aria-label="Search listings"
        />
        {value && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-lg leading-none text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>
    </form>
  );
}
