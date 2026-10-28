#!/usr/bin/env node
// Run `turbo dev` against the local Supabase stack instead of the project in
// .env.local. Shell env wins over .env.local for both the API/Telefun loaders
// and Vite, so no env file is edited. Turbo's default strict env mode drops
// undeclared vars, hence --env-mode=loose. Requires `supabase start` first.
// Usage: node scripts/dev-local.mjs
import { execFileSync, spawn } from "node:child_process";

let status;
try {
  status = execFileSync("supabase", ["status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
} catch {
  console.error("Supabase lokal belum jalan. Jalankan: supabase start");
  process.exit(1);
}

const local = Object.fromEntries(
  status
    .split("\n")
    .map((line) => line.match(/^([A-Z_]+)="?([^"]*)"?$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value]),
);

const env = {
  ...process.env,
  SUPABASE_URL: local.API_URL,
  SUPABASE_ANON_KEY: local.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  VITE_SUPABASE_URL: local.API_URL,
  VITE_SUPABASE_ANON_KEY: local.ANON_KEY,
};
// Loose mode would hand one PORT to every app; keep each app's own default
// (web 3005, API 3001, Telefun 3002).
delete env.PORT;

console.log(`dev-local: Supabase ${local.API_URL}`);
const child = spawn(
  "pnpm",
  ["exec", "turbo", "run", "dev", "--env-mode=loose"],
  { env, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => process.exit(code ?? 1));
