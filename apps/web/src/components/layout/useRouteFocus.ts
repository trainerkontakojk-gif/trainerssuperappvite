import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, type RefObject } from "react";
import { buildBreadcrumb } from "./nav-config";

const APP_TITLE = "Trainers SuperApp";
/** Batas tunggu `h1` yang baru muncul setelah data halaman dimuat. */
const HEADING_WAIT_MS = 1500;

/**
 * Setelah pindah halaman di shell: `document.title` mengikuti breadcrumb, dan
 * fokus pindah ke `h1` halaman baru, atau ke region konten bila tidak ada.
 * Fokus baru dipindah setelah router merender halaman baru (`onRendered`),
 * agar `h1` halaman lama tidak ikut terpilih. Muatan awal tidak memindahkan
 * fokus.
 */
export function useRouteFocus(
  pathname: string,
  contentRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const router = useRouter();
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) return;
    const crumbs = buildBreadcrumb(pathname);
    const pageLabel = crumbs[crumbs.length - 1]?.label;
    document.title =
      pageLabel && pageLabel !== APP_TITLE
        ? `${pageLabel} · ${APP_TITLE}`
        : APP_TITLE;
  }, [pathname, enabled]);

  useEffect(() => {
    let cancelPending = () => {};
    // Navigasi berjalan di dalam transition React: saat `onRendered`, halaman
    // lama bisa masih tampil sampai route lazy selesai dimuat. `h1` lama
    // dicatat di sini agar tidak dikira milik halaman baru.
    let staleHeading: Element | null = null;

    const unsubscribeBefore = router.subscribe("onBeforeNavigate", (event) => {
      if (event.pathChanged)
        staleHeading = contentRef.current?.querySelector("h1") ?? null;
    });
    const unsubscribeRendered = router.subscribe("onRendered", (event) => {
      if (!event.pathChanged || !event.fromLocation) return;
      const content = contentRef.current;
      if (!enabledRef.current || !content) return;
      cancelPending();
      cancelPending = moveFocusIntoPage(content, staleHeading);
    });

    return () => {
      cancelPending();
      unsubscribeBefore();
      unsubscribeRendered();
    };
  }, [router, contentRef]);
}

/** Fokus ke `h1` baru di `content`; tunggu sebentar bila belum ada. */
function moveFocusIntoPage(content: HTMLElement, staleHeading: Element | null) {
  // Pengguna sudah berpindah ke dalam konten (mis. mengetik): jangan direbut.
  const userMovedIntoContent = () =>
    content.contains(document.activeElement) &&
    document.activeElement !== content;

  const focusHeading = () => {
    const heading = content.querySelector<HTMLElement>("h1");
    if (!heading || heading === staleHeading) return false;
    if (userMovedIntoContent()) return true;
    if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    return true;
  };

  if (focusHeading()) return () => {};

  let timer = 0;
  const observer = new MutationObserver(() => {
    if (!focusHeading()) return;
    observer.disconnect();
    window.clearTimeout(timer);
  });
  timer = window.setTimeout(() => {
    observer.disconnect();
    if (!userMovedIntoContent()) content.focus({ preventScroll: true });
  }, HEADING_WAIT_MS);
  observer.observe(content, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    window.clearTimeout(timer);
  };
}
