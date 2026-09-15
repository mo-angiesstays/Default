"use client";

import { useCallback, useId, useRef, useState } from "react";
import { api } from "@/lib/client";

/**
 * Take-a-photo control for cleaners and handymen.
 *
 * `capture="environment"` makes a phone open the rear camera straight away
 * rather than a file browser. Pictures are downscaled and re-encoded in the
 * browser before upload: a modern phone camera produces 4–12MB per shot, and
 * the people using this are often standing in a rural property on one bar of
 * signal. ~300KB uploads in a couple of seconds; 8MB frequently doesn't finish.
 */

export type UploadedPhoto = { id: string; url: string };

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

type PendingUpload = {
  key: string;
  file: File;
  previewUrl: string;
  status: "uploading" | "failed";
  error?: string;
};

export function PhotoCapture({
  value,
  onChange,
  label = "Take a photo",
  max = 6,
  disabled = false,
  hint,
}: {
  /** Photo URLs already attached. */
  value: string[];
  onChange: (urls: string[]) => void;
  label?: string;
  max?: number;
  disabled?: boolean;
  hint?: string;
}) {
  const cameraInputId = useId();
  const libraryInputId = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [viewing, setViewing] = useState<string | null>(null);

  const remaining = max - value.length - pending.length;

  const upload = useCallback(
    async (key: string, file: File) => {
      try {
        const prepared = await downscale(file);
        const form = new FormData();
        form.append("file", prepared.file);
        if (prepared.width) form.append("width", String(prepared.width));
        if (prepared.height) form.append("height", String(prepared.height));

        const result = await api<UploadedPhoto>("/api/media", {
          method: "POST",
          body: form,
        });

        setPending((current) => {
          const match = current.find((item) => item.key === key);
          if (match) URL.revokeObjectURL(match.previewUrl);
          return current.filter((item) => item.key !== key);
        });
        // Read the latest value at call time — several uploads can land together.
        onChange([...valueRef.current, result.url]);
      } catch (error) {
        setPending((current) =>
          current.map((item) =>
            item.key === key
              ? {
                  ...item,
                  status: "failed",
                  error: error instanceof Error ? error.message : "Upload failed",
                }
              : item,
          ),
        );
      }
    },
    [onChange],
  );

  // Keeps concurrent uploads from clobbering each other's additions.
  const valueRef = useRef(value);
  valueRef.current = value;

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const accepted = Array.from(files).slice(0, Math.max(0, remaining));

    for (const file of accepted) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const previewUrl = URL.createObjectURL(file);
      setPending((current) => [...current, { key, file, previewUrl, status: "uploading" }]);
      void upload(key, file);
    }
  };

  const retry = (item: PendingUpload) => {
    setPending((current) =>
      current.map((p) => (p.key === item.key ? { ...p, status: "uploading", error: undefined } : p)),
    );
    void upload(item.key, item.file);
  };

  const discard = (item: PendingUpload) => {
    URL.revokeObjectURL(item.previewUrl);
    setPending((current) => current.filter((p) => p.key !== item.key));
  };

  const removeSaved = (url: string) => onChange(value.filter((u) => u !== url));

  return (
    <div className="space-y-2">
      <input
        id={cameraInputId}
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        id={libraryInputId}
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {value.length || pending.length ? (
        <div className="flex flex-wrap gap-2">
          {value.map((url) => (
            <div key={url} className="group relative">
              <button
                type="button"
                onClick={() => setViewing(url)}
                className="block h-20 w-20 overflow-hidden rounded-lg border border-ink-200 bg-ink-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Attached photo" className="h-full w-full object-cover" />
              </button>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => removeSaved(url)}
                  aria-label="Remove photo"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink-900 text-xs text-white shadow"
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}

          {pending.map((item) => (
            <div key={item.key} className="relative">
              <div className="h-20 w-20 overflow-hidden rounded-lg border border-ink-200 bg-ink-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt=""
                  className={`h-full w-full object-cover ${
                    item.status === "failed" ? "opacity-40" : "opacity-60"
                  }`}
                />
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                {item.status === "uploading" ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/60 border-t-white" />
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => retry(item)}
                      className="rounded bg-ink-900/80 px-1.5 py-0.5 text-[11px] font-medium text-white"
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => discard(item)}
                      className="text-[11px] text-red-700 underline"
                    >
                      Discard
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {pending.some((item) => item.status === "failed") ? (
        <p className="text-xs text-red-700">
          {pending.find((item) => item.status === "failed")?.error} — the photo is still here, so
          retry once you have signal.
        </p>
      ) : null}

      {!disabled && remaining > 0 ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => cameraRef.current?.click()}
          >
            📷 {label}
          </button>
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() => libraryRef.current?.click()}
          >
            Choose existing
          </button>
        </div>
      ) : null}

      {hint ? <p className="text-xs text-ink-400">{hint}</p> : null}
      {remaining <= 0 && max > 1 ? (
        <p className="text-xs text-ink-400">
          That&apos;s the maximum of {max} photos. Remove one to add another.
        </p>
      ) : null}

      {viewing ? <Lightbox url={viewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}

/** Full-screen photo view. */
export function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-900/90 p-4"
      onClick={onClose}
      role="presentation"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Photo" className="max-h-full max-w-full rounded-lg object-contain" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium text-ink-900"
      >
        Close
      </button>
    </div>
  );
}

/** Read-only strip of photo thumbnails with a tap-to-enlarge viewer. */
export function PhotoStrip({ urls, size = 64 }: { urls: string[]; size?: number }) {
  const [viewing, setViewing] = useState<string | null>(null);
  if (!urls.length) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {urls.map((url) => (
          <button
            key={url}
            type="button"
            onClick={() => setViewing(url)}
            className="overflow-hidden rounded-lg border border-ink-200 bg-ink-100"
            style={{ width: size, height: size }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Photo" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      {viewing ? <Lightbox url={viewing} onClose={() => setViewing(null)} /> : null}
    </>
  );
}

/**
 * Shrinks a camera photo to something that uploads over a weak connection.
 *
 * `imageOrientation: "from-image"` is what stops photos arriving sideways:
 * phones record rotation in EXIF rather than rotating the pixels, and drawing
 * to a canvas discards that metadata. If anything here fails — an exotic
 * format, a browser without createImageBitmap — the original file is sent
 * unchanged rather than losing the photo.
 */
async function downscale(
  file: File,
): Promise<{ file: File; width: number | null; height: number | null }> {
  try {
    if (typeof createImageBitmap !== "function") return { file, width: null, height: null };

    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return { file, width: null, height: null };
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return { file, width: null, height: null };

    // Re-encoding a small screenshot can make it bigger — keep the smaller one.
    if (blob.size >= file.size && scale === 1) return { file, width, height };

    const name = file.name.replace(/\.[^.]+$/, "") || "photo";
    return {
      file: new File([blob], `${name}.jpg`, { type: "image/jpeg" }),
      width,
      height,
    };
  } catch {
    return { file, width: null, height: null };
  }
}
