import { Hono } from "hono";
import { User } from "@supabase/supabase-js";
import { sidakCore } from "./sidak/core";
import { sidakTemuan } from "./sidak/temuan";
import { sidakDashboard } from "./sidak/dashboard";
import { sidakForecast } from "./sidak/forecast";
import { sidakRuleVersions } from "./sidak/rule-versions";
import { sidakReports } from "./sidak/reports";
import { sidakSimulations } from "./sidak/simulations";
import { sidakJadwalShifting } from "./sidak/jadwal-shifting";
import { sidakHeatmap } from "./sidak/heatmap";

type Variables = { user: User; profile: any };

const sidak = new Hono<{ Variables: Variables }>();

sidak.route("/", sidakCore);
sidak.route("/", sidakTemuan);
sidak.route("/", sidakDashboard);
sidak.route("/", sidakForecast);
sidak.route("/", sidakRuleVersions);
sidak.route("/", sidakReports);
sidak.route("/", sidakSimulations);
sidak.route("/", sidakJadwalShifting);
sidak.route("/", sidakHeatmap);

export { sidak };
