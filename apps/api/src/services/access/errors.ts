export class ScopeUnavailableError extends Error {
  readonly code = "SCOPE_UNAVAILABLE";
  readonly status = 503;
  constructor() {
    super("Scope akses tidak dapat diverifikasi. Silakan coba lagi.");
  }
}
