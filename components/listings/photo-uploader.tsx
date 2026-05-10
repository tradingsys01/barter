"use client";

import { useState, useRef } from "react";
import { MAX_IMAGES } from "@/lib/listings/internal";

const MAX_DIMENSION = 1000;
const JPEG_QUALITY = 0.75;

async function resizeImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
        resolve(file);
        return;
      }

      if (width > height) {
        height = Math.round((height * MAX_DIMENSION) / width);
        width = MAX_DIMENSION;
      } else {
        width = Math.round((width * MAX_DIMENSION) / height);
        height = MAX_DIMENSION;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Could not create blob"));
            return;
          }
          const resized = new File([blob], file.name, { type: "image/jpeg" });
          resolve(resized);
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = URL.createObjectURL(file);
  });
}

export function PhotoUploader({ name }: { name: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).slice(0, MAX_IMAGES);
    if (picked.length === 0) return;

    setProcessing(true);
    try {
      const resized = await Promise.all(picked.map(resizeImage));
      setFiles(resized);

      // Replace input files with resized versions using DataTransfer
      const dt = new DataTransfer();
      resized.forEach((f) => dt.items.add(f));
      if (inputRef.current) {
        inputRef.current.files = dt.files;
      }
    } catch (err) {
      console.error("Image resize failed:", err);
      setFiles(picked);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept="image/*"
        multiple
        onChange={onPick}
        className="block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-emerald-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-emerald-700 hover:file:bg-emerald-100"
      />
      <p className="text-xs text-zinc-500">
        Up to {MAX_IMAGES} photos. Large images will be resized automatically.
      </p>
      {processing && (
        <p className="text-sm text-zinc-600">Resizing images…</p>
      )}
      {files.length > 0 && !processing && (
        <div className="grid grid-cols-3 gap-2">
          {files.map((f, i) => (
            <div key={i} className="aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
