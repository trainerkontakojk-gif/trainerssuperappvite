import { Hono } from "hono";
import { Variables } from "./route-utils";
import { simulation } from "./simulation";
import { mailbox } from "./mailbox";
import { history } from "./history";
import { settings } from "./settings";

const pdkt = new Hono<{ Variables: Variables }>();

// Aggregate sub-routers
pdkt.route("/", simulation);
pdkt.route("/mailbox", mailbox);
pdkt.route("/history", history);
pdkt.route("/settings", settings);

export { pdkt };
