const MAX_PROFILER_PPTX_IMAGE_DATA_URL_CHARS = 8 * 1024 * 1024;
const SUPPORTED_PROFILER_PPTX_IMAGE_DATA_URL =
  /^data:image\/(?:png|jpe?g|gif|svg\+xml);base64,[a-z0-9+/=\r\n]+$/i;

export function isSupportedProfilerPptxPhoto(value: unknown): value is string {
  return Boolean(
    typeof value === "string" &&
    value.length <= MAX_PROFILER_PPTX_IMAGE_DATA_URL_CHARS &&
    SUPPORTED_PROFILER_PPTX_IMAGE_DATA_URL.test(value),
  );
}

export function sanitizeProfilerPptxImageData(value: unknown): string | null {
  return isSupportedProfilerPptxPhoto(value) ? value : null;
}
