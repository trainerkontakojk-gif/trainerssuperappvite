/**
 * Helper bersama untuk `ui/select` (Base UI) di spec E2E.
 *
 * Base UI Select bukan `<select>` native: pemicu berupa `combobox` berlabel dan
 * opsi hanya ada di DOM saat popup terbuka. Jadi `selectOption`, `option` count,
 * dan `toHaveValue` tidak berlaku. Helper ini menerjemahkan maksud yang sama:
 * pilih opsi lewat nama aksesibelnya, baca daftar opsi yang benar-benar terlihat
 * pengguna, dan baca nilai terpilih dari teks pemicu.
 */

import { expect, type Locator, type Page } from "@playwright/test";

/** Pemicu select berlabel (`aria-label` / `<label for>`), cocok persis. */
export function selectTrigger(page: Page | Locator, label: string): Locator {
  return page.getByRole("combobox", { name: label, exact: true });
}

/** Buka popup pemicu dan tunggu daftar opsinya muncul. */
export async function openSelect(trigger: Locator): Promise<Locator> {
  await expect(trigger).toBeEnabled();
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  const listbox = trigger.page().getByRole("listbox");
  await expect(listbox).toBeVisible();
  return listbox;
}

/** Tutup popup (jika terbuka) dan tunggu sampai benar-benar hilang. */
export async function closeSelect(trigger: Locator): Promise<void> {
  const page = trigger.page();
  if ((await trigger.getAttribute("aria-expanded")) === "true") {
    await page.keyboard.press("Escape");
  }
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

/** Pilih opsi berdasarkan nama aksesibel persis (teks yang dilihat pengguna). */
export async function pickSelect(
  page: Page,
  label: string,
  optionName: string,
): Promise<void> {
  const trigger = selectTrigger(page, label);
  const listbox = await openSelect(trigger);
  await listbox.getByRole("option", { name: optionName, exact: true }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

/** Pilih opsi pada pemicu yang sudah ditemukan (mis. `parameterSelect(page)`). */
export async function pickFromTrigger(
  trigger: Locator,
  optionName: string,
): Promise<void> {
  const listbox = await openSelect(trigger);
  await listbox.getByRole("option", { name: optionName, exact: true }).click();
  await expect(trigger.page().getByRole("listbox")).toHaveCount(0);
}

/** Teks semua opsi, urut seperti yang ditampilkan. Popup ditutup lagi. */
export async function selectOptionLabels(trigger: Locator): Promise<string[]> {
  const listbox = await openSelect(trigger);
  const labels = await listbox
    .getByRole("option")
    .evaluateAll((nodes) =>
      nodes.map((node) => (node.textContent ?? "").trim()),
    );
  await closeSelect(trigger);
  return labels;
}

/** Elemen nilai terpilih di dalam pemicu (tanpa ikon chevron). */
export function selectValue(trigger: Locator): Locator {
  return trigger.locator('[data-slot="select-value"]');
}

/** Teks opsi terpilih yang terlihat pada pemicu. */
export async function selectedLabel(trigger: Locator): Promise<string> {
  return ((await selectValue(trigger).innerText()) ?? "").trim();
}
