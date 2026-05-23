import type { CSSProperties } from "react";
import type { ProfilerPeserta } from "@trainers/types";

export interface PhotoFrame {
  x: number;
  y: number;
  zoom: number;
}

export interface PhotoFrameDraft extends PhotoFrame {
  isDirty: boolean;
  updatedAt: number;
}

export const DEFAULT_PHOTO_FRAME: PhotoFrame = {
  x: 50,
  y: 50,
  zoom: 1,
};

const STORAGE_KEY = "profiler-photo-frames-v1";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const sanitizeFrame = (
  raw?: Partial<PhotoFrame> | any | null
): PhotoFrame => {
  if (!raw) return DEFAULT_PHOTO_FRAME;
  return {
    x: clamp(Number(raw.x ?? DEFAULT_PHOTO_FRAME.x), 0, 100),
    y: clamp(Number(raw.y ?? DEFAULT_PHOTO_FRAME.y), 0, 100),
    zoom: clamp(Number(raw.zoom ?? DEFAULT_PHOTO_FRAME.zoom), 1, 2.5),
  };
};

const readAllDrafts = (): Record<string, PhotoFrameDraft> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, PhotoFrameDraft>;
  } catch {
    return {};
  }
};

const writeAllDrafts = (drafts: Record<string, PhotoFrameDraft>) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
};

export const resolvePhotoFrame = (
  pesertaId?: string | null,
  serverFrame?: Partial<PhotoFrame> | any | null
): PhotoFrame => {
  const normalizedServer = sanitizeFrame(serverFrame);
  if (!pesertaId) return normalizedServer;

  const drafts = readAllDrafts();
  const draft = drafts[pesertaId];

  if (draft) {
    const normalizedDraft = sanitizeFrame(draft);
    if (draft.isDirty || !serverFrame) {
      return normalizedDraft;
    }
  }

  return normalizedServer;
};

export const updatePhotoFrameDraft = (
  pesertaId: string,
  frame: Partial<PhotoFrame>
) => {
  if (!pesertaId || typeof window === "undefined") return;
  const drafts = readAllDrafts();
  const current = drafts[pesertaId] || {
    ...DEFAULT_PHOTO_FRAME,
    isDirty: false,
    updatedAt: 0,
  };

  const next = sanitizeFrame({ ...current, ...frame });
  drafts[pesertaId] = {
    ...next,
    isDirty: true,
    updatedAt: Date.now(),
  };
  writeAllDrafts(drafts);
};

export const markPhotoFrameAsSaved = (pesertaId: string, frame: PhotoFrame) => {
  if (!pesertaId || typeof window === "undefined") return;
  const drafts = readAllDrafts();
  drafts[pesertaId] = {
    ...frame,
    isDirty: false,
    updatedAt: Date.now(),
  };
  writeAllDrafts(drafts);
};

export const clearPhotoFrameDraft = (pesertaId: string) => {
  if (!pesertaId || typeof window === "undefined") return;
  const drafts = readAllDrafts();
  delete drafts[pesertaId];
  writeAllDrafts(drafts);
};

export const getPhotoImageStyle = (frame: PhotoFrame): CSSProperties => ({
  objectFit: "cover",
  objectPosition: `${frame.x}% ${frame.y}%`,
  transform: `scale(${frame.zoom})`,
  transformOrigin: `${frame.x}% ${frame.y}%`,
});

export const getPhotoInlineStyle = (frame: PhotoFrame): string =>
  `width:100%;height:100%;object-fit:cover;object-position:${frame.x}% ${frame.y}%;transform:scale(${frame.zoom});transform-origin:${frame.x}% ${frame.y}%;`;

export const getPhotoFrame = resolvePhotoFrame;
export const setPhotoFrame = updatePhotoFrameDraft;
export const normalizePhotoFrame = sanitizeFrame;
