const railwayEnvKeys = [
  "RAILWAY_ENVIRONMENT",
  "RAILWAY_PROJECT_ID",
  "RAILWAY_SERVICE_ID",
  "RAILWAY_DEPLOYMENT_ID",
];

const isRailway = railwayEnvKeys.some((key) => Boolean(process.env[key]));

if (isRailway) {
  console.error("[deploy-guard] Refusing to run Vite dev server on Railway.");
  console.error("[deploy-guard] Use Railway Web Build Command: pnpm run build:web");
  console.error("[deploy-guard] Use Railway Web Start Command: pnpm run start:web");
  process.exit(1);
}
