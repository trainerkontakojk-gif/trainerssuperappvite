const PUBLIC_ROUTE_PATHS = new Set([
  "/",
  "/kegiatan",
  "/auth/callback",
  "/waiting-approval",
  "/reset-password",
]);

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTE_PATHS.has(pathname);
}
