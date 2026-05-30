import { Hono } from "hono";
import { User } from "@supabase/supabase-js";
import { sidakCore } from "./sidak/core";
import { sidakTemuan } from "./sidak/temuan";
import { sidakDashboard } from "./sidak/dashboard";
import { sidakRuleVersions } from "./sidak/rule-versions";
import { sidakReports } from "./sidak/reports";

type Variables = { user: User; profile: any };

const sidak = new Hono<{ Variables: Variables }>();

sidak.route("/", sidakCore);
sidak.route("/", sidakTemuan);
sidak.route("/", sidakDashboard);
sidak.route("/", sidakRuleVersions);
sidak.route("/", sidakReports);

export { sidak };
