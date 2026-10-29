import { z } from "zod";

export const TRAINER_ACTIVITY_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Programs shown on the public Kegiatan Trainers page, in fixed display order. */
export const TRAINER_ACTIVITY_PROGRAMS = [
  {
    value: "sobat",
    label: "SOBAT",
    fullName: "Solid Backup Antar Tim",
  },
  {
    value: "ketik",
    label: "KETIK",
    fullName: "Kelas Etika & Trik Komunikasi",
  },
  {
    value: "telefun",
    label: "Telefun",
    fullName: "Telephone Fun",
  },
  {
    value: "pdkt",
    label: "PDKT",
    fullName: "Paham Dulu Kasih Tanggapan",
  },
  {
    value: "ceriwis",
    label: "CERIWIS",
    fullName: "Customer Experience Improvement With Smile",
  },
] as const;

export type TrainerActivityProgram =
  (typeof TRAINER_ACTIVITY_PROGRAMS)[number]["value"];

const trainerActivityProgramSchema = z.enum(
  TRAINER_ACTIVITY_PROGRAMS.map(({ value }) => value) as [
    TrainerActivityProgram,
    ...TrainerActivityProgram[],
  ],
);

const trainerActivityKindSchema = z.enum(["poster", "foto"]);
const trainerActivityDateSchema = z
  .string()
  .date("Tanggal harus format YYYY-MM-DD dan tanggal kalender yang nyata");

const trainerActivityDriveUrlSchema = z
  .url("Link harus berasal dari Google Drive atau Google Docs")
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        ["drive.google.com", "docs.google.com"].includes(url.hostname)
      );
    } catch {
      return false;
    }
  }, "Link harus berasal dari Google Drive atau Google Docs");

const trainerActivityImageDataSchema = z
  .string()
  .regex(
    /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]*={0,2}$/,
    "Gambar harus PNG, JPEG, atau WebP dalam format data URL",
  )
  .refine((value) => {
    const encoded = value.slice(value.indexOf(",") + 1);
    const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
    const decodedBytes = Math.floor((encoded.length * 3) / 4) - padding;
    return decodedBytes > 0 && decodedBytes <= TRAINER_ACTIVITY_MAX_IMAGE_BYTES;
  }, "Ukuran gambar maksimal 5 MB");

/**
 * Shared create/update payload. The API requires `image` on create and accepts
 * a same-bucket `image_url` only for updates that keep the existing image.
 */
export const trainerActivityInputSchema = z
  .object({
    year: z.number().int().min(2020).max(2100),
    program: trainerActivityProgramSchema,
    kind: trainerActivityKindSchema,
    title: z.string().trim().min(1).max(120),
    event_date: trainerActivityDateSchema.nullable(),
    drive_url: trainerActivityDriveUrlSchema,
    sort_order: z.number().int(),
    is_published: z.boolean(),
    image: trainerActivityImageDataSchema.optional(),
    image_url: z.string().url().optional(),
  })
  .refine(({ image, image_url }) => Boolean(image) !== Boolean(image_url), {
    message: "Pilih gambar baru atau gunakan gambar kegiatan yang sudah ada",
    path: ["image"],
  });

export type TrainerActivityInput = z.infer<typeof trainerActivityInputSchema>;

/** Complete database row returned to authorized activity managers. */
export interface TrainerActivity {
  id: string;
  year: number;
  program: TrainerActivityProgram;
  kind: "poster" | "foto";
  title: string;
  event_date: string | null;
  image_url: string;
  drive_url: string;
  sort_order: number;
  is_published: boolean;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Public rows intentionally omit publication and actor metadata. */
export type PublicTrainerActivity = Omit<
  TrainerActivity,
  "created_by" | "updated_by" | "is_published"
>;

export interface PublicKegiatanResponse {
  years: number[];
  year: number | null;
  items: PublicTrainerActivity[];
}
