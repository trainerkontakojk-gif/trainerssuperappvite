import { describe, expect, it } from "vitest";
import { buildSlideHTML } from "./profilerSlideHtml";

describe("buildSlideHTML", () => {
  it("escapes user-controlled profiler fields before building export HTML", () => {
    const html = buildSlideHTML(
      {
        id: "peserta-1",
        nama: '<img src=x onerror="alert(1)">',
        jabatan: 'Agent"><script>alert(2)</script>',
        tim: 'Telepon"><script>alert(3)</script>',
        foto_url: 'https://example.test/avatar.jpg" onerror="alert(4)',
        email_ojk: 'user@example.test"><script>alert(5)</script>',
        catatan_tambahan: "<script>alert(6)</script>",
        keterangan: '<svg onload="alert(7)"></svg>',
      } as any,
      'Batch"><script>alert(8)</script>',
      "landscape",
    );

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain('onerror="alert');
    expect(html).not.toContain('onload="alert');
    expect(html).toContain("&lt;script&gt;alert(6)&lt;/script&gt;");
    expect(html).toContain("&lt;svg onload=&quot;alert(7)&quot;&gt;&lt;/svg&gt;");
  });
});
