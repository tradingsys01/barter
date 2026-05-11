"use client";

import { useState } from "react";
import { RideFields } from "./ride-fields";
import { PhotoUploader } from "./photo-uploader";

type Category = { id: string; name: string; slug: string };
type Area = { id: string; name: string; slug: string };
type Listing = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  category_id: string | null;
  area_id: string | null;
  wants_text: string | null;
  route_from: string | null;
  route_to: string | null;
  schedule: string | null;
  seats: number | null;
  gas_share: boolean;
};

type Props = {
  action: (form: FormData) => Promise<void>;
  listing: Listing;
  categories: Category[];
  areas: Area[];
  ridesCategoryId: string | null;
};

export function EditListingForm({ action, listing, categories, areas, ridesCategoryId }: Props) {
  const [selectedCategory, setSelectedCategory] = useState(listing.category_id ?? "");
  const isRide = ridesCategoryId !== null && selectedCategory === ridesCategoryId;

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="id" value={listing.id} />

      {/* Type & Category row */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Type" htmlFor="type">
          <select
            id="type"
            name="type"
            defaultValue={listing.type}
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="offer">Offering</option>
            <option value="want">Wanted</option>
          </select>
        </Field>

        <Field label="Category" htmlFor="category_id">
          <select
            id="category_id"
            name="category_id"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
      </div>

      {/* Ride fields (conditional) */}
      <RideFields
        areas={areas}
        show={isRide}
        defaultValues={isRide ? {
          route_from: listing.route_from ?? undefined,
          route_to: listing.route_to ?? undefined,
          schedule: listing.schedule ?? undefined,
          seats: listing.seats ?? undefined,
          gas_share: listing.gas_share,
        } : undefined}
      />

      {/* Title */}
      <Field label="Title" htmlFor="title">
        <input
          id="title"
          name="title"
          defaultValue={listing.title}
          required
          minLength={3}
          maxLength={120}
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-lg text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </Field>

      {/* Description */}
      <Field label="Description" htmlFor="description" optional>
        <textarea
          id="description"
          name="description"
          defaultValue={listing.description ?? ""}
          rows={5}
          maxLength={2000}
          placeholder="Add details about condition, quantity, or anything else…"
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </Field>

      {/* Area & Swap preferences row */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Area" htmlFor="area_id">
          <select
            id="area_id"
            name="area_id"
            defaultValue={listing.area_id ?? ""}
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>

        <Field label="What I'd swap for" htmlFor="wants_text" optional>
          <input
            id="wants_text"
            name="wants_text"
            defaultValue={listing.wants_text ?? ""}
            maxLength={500}
            placeholder="e.g. firewood, eggs, help with…"
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </Field>
      </div>

      {/* Add new photos */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-700">
          Add photos <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <PhotoUploader name="photos" />
      </div>

      {/* Submit */}
      <div className="flex justify-end border-t border-zinc-100 pt-6">
        <button
          type="submit"
          className="rounded-lg bg-emerald-600 px-8 py-3 text-base font-medium text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-600/25 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 active:scale-[0.98]"
        >
          Save changes
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-zinc-700">
        {label}
        {optional && <span className="ml-1 font-normal text-zinc-500">(optional)</span>}
      </label>
      {children}
    </div>
  );
}
