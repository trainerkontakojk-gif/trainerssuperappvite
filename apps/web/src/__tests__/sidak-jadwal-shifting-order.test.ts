import { describe, expect, it } from "vitest";
import {
  breakStartMinutes,
  orderScheduleRows,
} from "../components/sidak/jadwal-shifting/schedule-sections";

const row = (
  nama: string,
  overrides: Partial<{
    shift: string;
    channel: string;
    tl: string;
    activities: { slot: number; label: string; value: string }[];
  }> = {},
) => ({
  nama,
  shift: "H",
  channel: "Call",
  tl: "Rina Salim",
  activities: [] as { slot: number; label: string; value: string }[],
  ...overrides,
});

// Orden leksikografis dan interval LB valid sekarang dibuktikan melalui E2E
// pada UI pemilik. Kasus tersisa di sini tidak punya observasi UI yang setara:
// input malformed ke helper, immutability, dan default tanpa accessor.
describe("breakStartMinutes", () => {
  it("mengembalikan null untuk activities kosong, hilang, atau bukan array", () => {
    expect(breakStartMinutes([])).toBeNull();
    expect(breakStartMinutes(undefined as never)).toBeNull();
    expect(breakStartMinutes(null as never)).toBeNull();
  });
});

describe("orderScheduleRows", () => {
  const agents = [
    row("Zeta Email", { channel: "Email" }),
    row("Beta Chat", { channel: "Digital Chat" }),
    row("Leader Satu", { channel: "Leader" }),
    row("Call Stranger", { channel: "Zeta Support" }),
    row("Call Kosong", { channel: "" }),
    row("Call Terakhir", { channel: "Call", shift: "OFF" }),
    row("Call Kedua", { channel: "Call", shift: "S2" }),
    row("Call Pertama", { channel: "Call", shift: "S1" }),
  ];

  it("tidak mengubah daftar aslinya", () => {
    const copy = [...agents];
    orderScheduleRows(agents);
    expect(agents).toEqual(copy);
  });

  it("tetap mengurutkan TL lalu nama ketika tidak ada istirahat dan tanpa aksesor", () => {
    const rows = [
      row("Budi", { tl: "Zulfa" }),
      row("Ani", { tl: "" }),
      row("Cici", { tl: "Ahmad" }),
      row("Adi", { tl: "Ahmad" }),
    ];

    expect(orderScheduleRows(rows).map((item) => item.nama)).toEqual([
      "Adi",
      "Cici",
      "Budi",
      "Ani",
    ]);
  });
});
