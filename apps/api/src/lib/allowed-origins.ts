import { env } from "./env";

const DEV_ORIGINS = ["http://localhost:3000", "http://localhost:3005"];

/** Browser origins the API trusts for CORS and auth email redirects. */
export const allowedOrigins: string[] = (() => {
  const configured =
    env.ALLOWED_ORIGINS?.split(",")
      .map((o) => o.trim())
      .filter(Boolean) ?? [];
  if (configured.length) return configured;
  return env.NODE_ENV === "production" ? [] : DEV_ORIGINS;
})();
