{
  let stored = null;
  try {
    const value = globalThis.localStorage.getItem("theme");
    if (value === "light" || value === "dark") stored = value;
  } catch {
    stored = null;
  }
  globalThis.document
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute("content", stored ?? "light dark");
  globalThis.document.documentElement.classList.toggle(
    "dark",
    stored
      ? stored === "dark"
      : globalThis.matchMedia("(prefers-color-scheme: dark)").matches,
  );
}
