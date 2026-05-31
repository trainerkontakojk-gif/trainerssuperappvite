export const labelTim: Record<string, string> = {
  Telepon: "Telepon",
  Chat: "Chat",
  Email: "Email",
};

export interface TimTheme {
  accent: string;      // "#007AFF" (with #, for slides)
  accentRaw: string;   // "007AFF" (without #, for export pptxgenjs and raw styles)
  accentRgb: string;   // "#007AFF"
  light: string;       // "#EBF4FF"
  label: string;       // "Tim Telepon"
  tailwind: string;    // "text-blue-500"
  bg: string;          // "bg-blue-50 dark:bg-blue-500/10"
  border: string;      // "border-blue-200 dark:border-blue-500/20"
  badge?: string;      // Compatibility for tests
}

export const timTheme = (tim: string): TimTheme => {
  const t = tim?.toLowerCase();
  if (t === "telepon") {
    return {
      accent: "#007AFF",
      accentRaw: "007AFF",
      accentRgb: "#007AFF",
      light: "#EBF4FF",
      label: "Tim Telepon",
      tailwind: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-500/10",
      border: "border-blue-200 dark:border-blue-500/20",
      badge: "bg-blue-50 dark:bg-blue-500/10",
    };
  }
  if (t === "chat") {
    return {
      accent: "#34C759",
      accentRaw: "34C759",
      accentRgb: "#34C759",
      light: "#EDFAF1",
      label: "Tim Chat",
      tailwind: "text-green-500",
      bg: "bg-green-50 dark:bg-green-500/10",
      border: "border-green-200 dark:border-green-500/20",
      badge: "bg-green-50 dark:bg-green-500/10",
    };
  }
  if (t === "email") {
    return {
      accent: "#FF9500",
      accentRaw: "FF9500",
      accentRgb: "#FF9500",
      light: "#FFF6E8",
      label: "Tim Email",
      tailwind: "text-orange-500",
      bg: "bg-orange-50 dark:bg-orange-500/10",
      border: "border-orange-200 dark:border-orange-500/20",
      badge: "bg-orange-50 dark:bg-orange-500/10",
    };
  }
  const resolvedLabel = labelTim[tim || ""] || tim || "-";
  return {
    accent: "#AF52DE",
    accentRaw: "AF52DE",
    accentRgb: "#AF52DE",
    light: "#F5EEFF",
    label: resolvedLabel,
    tailwind: "text-violet-500",
    bg: "bg-violet-50 dark:bg-violet-500/10",
    border: "border-violet-200 dark:border-violet-500/20",
    badge: "bg-violet-50 dark:bg-violet-500/10",
  };
};

export const hitungMasaDinas = (joinDate: string): string => {
  if (!joinDate) return "-";
  const join = new Date(joinDate);
  if (isNaN(join.getTime())) return "-";
  const now = new Date();
  let years = now.getFullYear() - join.getFullYear();
  let months = now.getMonth() - join.getMonth();
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years > 0) return `${years} thn ${months} bln`;
  return `${months} bln`;
};

export const hitungUsia = (birthDate: string): number => {
  if (!birthDate) return 0;
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
};

export const formatTanggal = (date: string): string => {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};
