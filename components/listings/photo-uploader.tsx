"use client";

import { useState } from "react";
import { MAX_IMAGES } from "@/lib/listings/internal";

export function PhotoUploader({ name }: { name: string }) {
  const [files, setFiles] = useState<File[]>([]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).slice(0, MAX_IMAGES);
    setFiles(picked);
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">
        Photos <span className="text-zinc-500">(up to {MAX_IMAGES})</span>
      </label>
      <input
        type="file"
        name={name}
        accept="image/*"
        multiple
        onChange={onPick}
        className="block w-full text-sm"
      />
      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {files.map((f, i) => (
            <div key={i} className="aspect-square overflow-hidden rounded border bg-zinc-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
