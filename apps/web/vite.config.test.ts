import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_PORT = process.env.PORT;

async function loadViteConfig(port: string | undefined) {
  vi.resetModules();

  if (port) {
    process.env.PORT = port;
  } else {
    delete process.env.PORT;
  }

  const module = await import("./vite.config");
  return module.default as {
    preview?: {
      host?: string;
      port?: number;
      strictPort?: boolean;
    };
  };
}

describe("Vite preview Railway config", () => {
  afterEach(() => {
    vi.resetModules();

    if (ORIGINAL_PORT) {
      process.env.PORT = ORIGINAL_PORT;
    } else {
      delete process.env.PORT;
    }
  });

  it("binds preview to the Railway PORT env var", async () => {
    const config = await loadViteConfig("4567");

    expect(config.preview).toMatchObject({
      host: "0.0.0.0",
      port: 4567,
      strictPort: true,
    });
  });
});
