import { describe, expect, it } from "vitest";
import {
  breakStartMinutes,
  LONG_BREAK_CODE,
  orderScheduleRows,
  SLOTS_PER_DAY,
} from "../components/sidak/jadwal-shifting/schedule-sections";

const slot = (value: string, slotIndex: number) => ({
  slot: slotIndex,
  label: "",
  value,
});

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

describe("breakStartMinutes", () => {
  it("memakai slot LB paling awal dan mengubahnya jadi menit sejak 00:00", () => {
    expect(
      breakStartMinutes([slot("LB", 44), slot("LB", 40), slot("LB", 41)]),
    ).toBe(40 * 15);
  });

  it("mengabaikan kode selain LB, kapitalisasi apa pun", () => {
    expect(breakStartMinutes([slot("lb", 12), slot("OFF", 4)])).toBe(12 * 15);
    expect(breakStartMinutes([slot("OFF", 4), slot("Training", 8)])).toBeNull();
  });

  it("mengembalikan null untuk activities kosong, hilang, atau bukan array", () => {
    expect(breakStartMinutes([])).toBeNull();
    expect(breakStartMinutes(undefined as never)).toBeNull();
    expect(breakStartMinutes(null as never)).toBeNull();
  });

  it("menolak slot di luar satu hari, sama seperti rentang yang dirender UI", () => {
    // Slot di luar hari tidak pernah tampil di kolom jam kerja, jadi tidak
    // boleh dipakai untuk mengurutkan baris seolah punya istirahat.
    expect(
      breakStartMinutes([slot(LONG_BREAK_CODE, SLOTS_PER_DAY)]),
    ).toBeNull();
    expect(
      breakStartMinutes([slot(LONG_BREAK_CODE, SLOTS_PER_DAY + 10)]),
    ).toBeNull();
    expect(breakStartMinutes([slot(LONG_BREAK_CODE, -1)])).toBeNull();
    expect(breakStartMinutes([slot(LONG_BREAK_CODE, SLOTS_PER_DAY - 1)])).toBe(
      (SLOTS_PER_DAY - 1) * 15,
    );
  });

  it("menolak slot yang bukan bilangan bulat", () => {
    expect(
      breakStartMinutes([
        slot(LONG_BREAK_CODE, 12.5),
        slot(LONG_BREAK_CODE, 20),
      ]),
    ).toBe(20 * 15);
    expect(breakStartMinutes([slot(LONG_BREAK_CODE, Number.NaN)])).toBeNull();
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

  it("menempatkan layanan sebagai kunci paling luar, baru shift di dalamnya", () => {
    expect(orderScheduleRows(agents).map((item) => item.nama)).toEqual([
      "Call Pertama",
      "Call Kedua",
      "Call Terakhir",
      "Beta Chat",
      "Zeta Email",
      "Leader Satu",
      "Call Stranger",
      "Call Kosong",
    ]);
  });

  it("tidak mengubah daftar aslinya", () => {
    const copy = [...agents];
    orderScheduleRows(agents);
    expect(agents).toEqual(copy);
  });

  it("mengurutkan istirahat di dalam layanan dan shift yang sama, tanpa break paling belakang", () => {
    const rows = [
      row("Tanpa Break"),
      row("Break Siang", { activities: [slot("LB", 48)] }),
      row("Break Pagi", { activities: [slot("LB", 40)] }),
    ];

    expect(
      orderScheduleRows(rows, (item) => breakStartMinutes(item.activities)).map(
        (item) => item.nama,
      ),
    ).toEqual(["Break Pagi", "Break Siang", "Tanpa Break"]);
  });

  it("menempatkan baris tanpa istirahat paling belakang walau TL-nya paling awal", () => {
    const rows = [
      row("Tanpa Break", { tl: "Ahmad" }),
      row("Ada Break", { tl: "Zulfa", activities: [slot("LB", 60)] }),
    ];

    expect(
      orderScheduleRows(rows, (item) => breakStartMinutes(item.activities)).map(
        (item) => item.nama,
      ),
    ).toEqual(["Ada Break", "Tanpa Break"]);
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
