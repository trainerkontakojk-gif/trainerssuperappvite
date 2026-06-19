import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

declare const process: { env: Record<string, string | undefined> };

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY = "test-anon-key";

const lsStore = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => lsStore.get(k) ?? null,
    setItem: (k: string, v: string) => {
      lsStore.set(k, v);
    },
    removeItem: (k: string) => {
      lsStore.delete(k);
    },
    clear: () => {
      lsStore.clear();
    },
    get length() {
      return lsStore.size;
    },
    key: (i: number) => [...lsStore.keys()][i] ?? null,
  },
  writable: true,
  configurable: true,
});
