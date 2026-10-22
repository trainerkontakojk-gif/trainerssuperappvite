/* global process, queueMicrotask */
import "./denyEgress.mjs";
import net from "node:net";

// Every required value is supplied by the fixture. Never load local secrets.
process.loadEnvFile = () => {};

// Global fetch guards do not cover ws or undici's own fetch. Block remote
// sockets too, before DNS/TCP; only this boot spec installs this preload.
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host =
    typeof first === "object"
      ? first.host
      : typeof args[1] === "string"
        ? args[1]
        : undefined;
  if (host && !["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
    process.stderr.write(`[socket-egress-denied] ${host}\n`);
    queueMicrotask(() => this.destroy(new Error("Egress denied")));
    return this;
  }
  return connect.apply(this, args);
};

// Production entrypoints use PORT=0. Bind only loopback and expose the actual
// port without modifying production startup code (Telefun logs env.PORT=0).
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  this.once("listening", () => {
    const address = this.address();
    process.stdout.write(`[e2e-listening] ${address.port}\n`);
  });
  if (typeof args[0] === "object") {
    args[0] = { ...args[0], host: "127.0.0.1" };
  } else if (typeof args[1] === "string") {
    args[1] = "127.0.0.1";
  } else {
    args.splice(1, 0, "127.0.0.1");
  }
  return listen.apply(this, args);
};
