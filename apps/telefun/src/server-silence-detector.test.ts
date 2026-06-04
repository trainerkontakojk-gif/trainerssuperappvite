import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverSource = readFileSync(join(__dirname, "server.ts"), "utf8");

describe("Telefun server silence detector", () => {
  it("does not instantiate or start the server-side SilenceDetector", () => {
    expect(serverSource).not.toContain("new SilenceDetector");
    expect(serverSource).not.toContain("silence.start()");
    expect(serverSource).not.toContain("silence.ping()");
    expect(serverSource).not.toContain("silence.stop()");
  });

  it("does not send server-generated silence events to the browser", () => {
    expect(serverSource).not.toContain('type: "silence"');
    expect(serverSource).not.toContain("Silence detected > 5s");
  });
});
