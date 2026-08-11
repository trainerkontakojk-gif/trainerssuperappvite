import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const DEFAULT_ITERATIONS = 10;
const MAX_ITERATIONS = 20;
const PROBE_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const CANONICALIZER_REPO_PATH =
  "apps/web/src/routes/telefun/services/openaiWebRtc/brokerApi.ts";
const CANONICALIZER_PACKAGE_PATH =
  "src/routes/telefun/services/openaiWebRtc/brokerApi.ts";

function parseArgs(argv) {
  let iterations = DEFAULT_ITERATIONS;
  let outputPath;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--output") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("missing_output_path");
      }
      outputPath = resolve(value);
      index += 1;
      continue;
    }
    if (argument === "--iterations") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > MAX_ITERATIONS) {
        throw new Error("invalid_iterations");
      }
      iterations = value;
      index += 1;
      continue;
    }
    throw new Error("unknown_argument");
  }

  return { iterations, outputPath };
}

function findRequestedOutputPath(argv) {
  let outputPath;

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--output") continue;
    const value = argv[index + 1];
    if (value && !value.startsWith("--")) outputPath = resolve(value);
    index += 1;
  }

  return outputPath;
}

function readGitValue(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function readCandidateIdentity() {
  const sha = readGitValue(["rev-parse", "HEAD"]);
  const headBlobSha = readGitValue([
    "rev-parse",
    `HEAD:${CANONICALIZER_REPO_PATH}`,
  ]);
  const worktreeBlobSha = readGitValue([
    "hash-object",
    CANONICALIZER_PACKAGE_PATH,
  ]);
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("invalid_candidate_sha");
  if (headBlobSha !== worktreeBlobSha) {
    throw new Error("candidate_source_mismatch");
  }
  return {
    canonicalizer: {
      headBlobSha,
      matchesHead: true,
      sourcePath: CANONICALIZER_REPO_PATH,
      worktreeBlobSha,
    },
    sha,
  };
}

async function loadCandidateCanonicalizer() {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    root: process.cwd(),
    server: { middlewareMode: true },
  });

  try {
    const candidateModule = await vite.ssrLoadModule(
      "/src/routes/telefun/services/openaiWebRtc/brokerApi.ts",
    );
    if (typeof candidateModule.createOpenAIWebRtcBrokerCall !== "function") {
      throw new Error("candidate_module_load_failed");
    }
    return {
      canonicalize: async (answerSdp) => {
        const brokerFetch = async () =>
          new globalThis.Response(answerSdp, {
            status: 201,
            headers: { "Content-Type": "application/sdp" },
          });
        const result = await candidateModule.createOpenAIWebRtcBrokerCall({
          fetch: brokerFetch,
          brokerHttpBaseUrl: "https://offline-broker.invalid",
          sessionId: PROBE_SESSION_ID,
          accessToken: "offline-probe-token",
          offerSdp: "v=0\r\n",
        });
        return result.answerSdp;
      },
      close: () => vite.close(),
    };
  } catch (error) {
    await vite.close();
    if (
      error instanceof Error &&
      error.message === "candidate_module_load_failed"
    ) {
      throw error;
    }
    throw new Error("candidate_module_load_failed", { cause: error });
  }
}

function sanitizedFailureStage(error) {
  if (!(error instanceof Error)) return "unknown_failure";
  const allowedStages = new Set([
    "browser_context_setup_failed",
    "browser_launch_failed",
    "browser_probe_failed",
    "candidate_module_load_failed",
    "candidate_source_mismatch",
    "invalid_candidate_sha",
    "invalid_iterations",
    "missing_output_path",
    "unknown_argument",
  ]);
  return allowedStages.has(error.message)
    ? error.message
    : "probe_execution_failed";
}

async function persistEvidence(evidence, outputPath) {
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (!outputPath) {
    process.stdout.write(serialized);
    return;
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, { encoding: "utf8", mode: 0o600 });
  process.stdout.write(
    `${JSON.stringify({ status: evidence.status, exitCode: evidence.exitCode, evidencePath: outputPath })}\n`,
  );
}

async function runBrowserProbe(iterations, canonicalize) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    throw new Error("browser_launch_failed");
  }
  let blockedNetworkRequests = 0;
  let stage = "browser_context_setup_failed";

  try {
    const context = await browser.newContext({ offline: true });
    await context.route("**/*", async (route) => {
      blockedNetworkRequests += 1;
      await route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    await page.exposeFunction("canonicalizeBrokerAnswerForProbe", canonicalize);

    const userAgent = await page.evaluate(() => globalThis.navigator.userAgent);
    stage = "browser_probe_failed";
    const result = await page.evaluate(async (count) => {
      const canonicalizeAnswer = globalThis.canonicalizeBrokerAnswerForProbe;

      const createAnswer = async () => {
        const offerer = new globalThis.RTCPeerConnection({ iceServers: [] });
        const answerer = new globalThis.RTCPeerConnection({ iceServers: [] });
        offerer.addTransceiver("audio", { direction: "sendrecv" });
        const offer = await offerer.createOffer();
        await offerer.setLocalDescription(offer);
        await answerer.setRemoteDescription(offer);
        const answer = await answerer.createAnswer();
        await answerer.setLocalDescription(answer);
        if (!answer.sdp) throw new Error("missing_answer_sdp");
        return { answerSdp: answer.sdp, answerer, offerer };
      };

      let canonicalAccepted = 0;
      let canonicalLineEndingsOnly = true;
      let canonicalOneTerminalCrlf = true;
      let trimmedRejected = 0;
      const trimmedErrorNames = {};

      for (let iteration = 0; iteration < count; iteration += 1) {
        const trimmedPair = await createAnswer();
        try {
          await trimmedPair.offerer.setRemoteDescription({
            type: "answer",
            sdp: trimmedPair.answerSdp.trim(),
          });
        } catch (error) {
          trimmedRejected += 1;
          const errorName =
            error instanceof globalThis.DOMException
              ? error.name
              : "NonDomException";
          trimmedErrorNames[errorName] =
            (trimmedErrorNames[errorName] ?? 0) + 1;
        } finally {
          trimmedPair.offerer.close();
          trimmedPair.answerer.close();
        }

        const canonicalPair = await createAnswer();
        try {
          const lfOnlyAnswer = canonicalPair.answerSdp
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");
          const canonicalAnswer = await canonicalizeAnswer(lfOnlyAnswer);
          const withoutCrlf = canonicalAnswer.replace(/\r\n/g, "");
          canonicalLineEndingsOnly &&=
            !withoutCrlf.includes("\r") && !withoutCrlf.includes("\n");
          canonicalOneTerminalCrlf &&=
            canonicalAnswer.endsWith("\r\n") &&
            !canonicalAnswer.endsWith("\r\n\r\n");
          await canonicalPair.offerer.setRemoteDescription({
            type: "answer",
            sdp: canonicalAnswer,
          });
          canonicalAccepted += 1;
        } finally {
          canonicalPair.offerer.close();
          canonicalPair.answerer.close();
        }
      }

      return {
        canonicalAccepted,
        canonicalLineEndingsOnly,
        canonicalOneTerminalCrlf,
        trimmedErrorNames,
        trimmedRejected,
      };
    }, iterations);

    await context.close();
    return {
      browser: {
        name: "chromium",
        userAgent,
        version: browser.version(),
      },
      blockedNetworkRequests,
      result,
    };
  } catch {
    throw new Error(stage);
  } finally {
    await browser.close();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  let args = {
    iterations: DEFAULT_ITERATIONS,
    outputPath: findRequestedOutputPath(argv),
  };
  let candidateSha = "unknown";
  let canonicalizer = {
    headBlobSha: "unknown",
    matchesHead: false,
    sourcePath: CANONICALIZER_REPO_PATH,
    worktreeBlobSha: "unknown",
  };
  const executedAtUtc = new Date().toISOString();
  let candidateCanonicalizer;

  try {
    args = parseArgs(argv);
    const candidateIdentity = readCandidateIdentity();
    candidateSha = candidateIdentity.sha;
    canonicalizer = candidateIdentity.canonicalizer;
    candidateCanonicalizer = await loadCandidateCanonicalizer();
    const probe = await runBrowserProbe(
      args.iterations,
      candidateCanonicalizer.canonicalize,
    );
    const passed =
      probe.result.trimmedRejected === args.iterations &&
      probe.result.canonicalAccepted === args.iterations &&
      probe.result.canonicalLineEndingsOnly &&
      probe.result.canonicalOneTerminalCrlf &&
      probe.blockedNetworkRequests === 0;

    const evidence = {
      schemaVersion: 1,
      candidateSha,
      canonicalizer,
      executedAtUtc,
      browser: probe.browser,
      controls: {
        outboundNetworkBlocked: true,
        providerCalls: 0,
        rawSdpPersisted: false,
      },
      expected: {
        canonicalAccepted: args.iterations,
        trimmedRejected: args.iterations,
      },
      observed: {
        ...probe.result,
        blockedNetworkRequests: probe.blockedNetworkRequests,
      },
      status: passed ? "pass" : "fail",
      exitCode: passed ? 0 : 1,
    };
    await persistEvidence(evidence, args.outputPath);
    process.exitCode = evidence.exitCode;
  } catch (error) {
    const evidence = {
      schemaVersion: 1,
      candidateSha,
      canonicalizer,
      executedAtUtc,
      browser: { name: "chromium", userAgent: "unknown", version: "unknown" },
      controls: {
        outboundNetworkBlocked: true,
        providerCalls: 0,
        rawSdpPersisted: false,
      },
      expected: {
        canonicalAccepted: args.iterations,
        trimmedRejected: args.iterations,
      },
      observed: {
        blockedNetworkRequests: 0,
        canonicalAccepted: 0,
        canonicalLineEndingsOnly: false,
        canonicalOneTerminalCrlf: false,
        trimmedErrorNames: {},
        trimmedRejected: 0,
      },
      status: "fail",
      exitCode: 1,
      failureStage: sanitizedFailureStage(error),
    };
    await persistEvidence(evidence, args.outputPath);
    process.exitCode = 1;
  } finally {
    await candidateCanonicalizer?.close();
  }
}

await main();
