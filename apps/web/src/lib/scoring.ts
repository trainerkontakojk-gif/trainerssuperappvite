export const scoreColor = (score: number) => {
  if (score >= 85) return "text-green-500";
  if (score >= 70) return "text-amber-500";
  return "text-red-500";
};

export const scoreBg = (score: number) => {
  if (score >= 85) return "bg-green-500";
  if (score >= 70) return "bg-amber-500";
  return "bg-red-500";
};

export const scoreLabel = (score: number) => {
  if (score >= 85) return "Baik";
  if (score >= 70) return "Cukup";
  return "Perlu Perhatian";
};
