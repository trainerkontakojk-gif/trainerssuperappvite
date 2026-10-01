# Pi harness runbook

This runbook complements [`AGENTS.md`](../AGENTS.md) and the canonical lane/gate rules in [`AGENT_WORKFLOW.md`](AGENT_WORKFLOW.md). Keep the built-in Pi system prompt and the project's stable, high-salience instructions. Do not add a custom `.pi/SYSTEM.md`, `AGENTS.override.md`, extension, or dependency to pursue prompt caching.

## Start and continue

1. Start in the repository root. Review the requested scope, ownership, dirty Git paths, acceptance criteria, likely risk lane, and verification gates. For Lane B/C/D behavior work, load `trainers-superapp-tdd` before final lane classification or editing. Read applicable docs/skills once for this task; use focused file/import/caller discovery and bounded output. Do not load history, Wiki, archives, or unrelated skills without an impact-driven reason.
2. For a fresh task, launch Pi in the project and explicitly select the intended available provider/model/thinking level when that is important:

   ```sh
   cd /path/to/trainerssuperappvite
   pi --list-models
   pi --provider <provider> --model <model-id> --thinking high
   ```

   Verify the exact requested model is listed before using it. The model may be specified as `provider/id`; do not infer identity from a prompt or route name. The interactive model picker is also valid. Keep the project cwd, provider/model, thinking level, tools, and loaded project resources stable for comparable related work where appropriate.

3. For related continuation, name a persistent session (`/name ...`), then from the same project directory use `pi --continue` or `pi --resume` / `/resume` to choose the named session. Continuing carries its active history; it does not guarantee a provider cache hit. Start a new session for unrelated work rather than appending it just to improve a ratio.
4. After changing `AGENTS.md`, perform `/reload` once at the boundary in an already-open Pi session so updated context is loaded. Only do this because the instructions changed, not to refresh cache. For a trusted project, approve/trust the project before relying on project-local settings/resources; inspect the files first. Project `.pi` settings/resources are trust-gated. Never trust an unreviewed project.
5. Keep safety and verification gates intact. Do not turn off automatic compaction to chase caching. Avoid regenerating volatile status, time, or task details in system guidance; pass changing facts in the user/tool messages.

## Delegation

Direct work is the default; delegate only when the user explicitly requests it. The parent/orchestrator is gate and advisor only for delegated work; workers own implementation. Verify the exact provider, model, and thinking level from live inventory, and give each worker a small scoped brief; do not spawn status-only workers. Continue a same-owner repair in a persistent session only if the original worker session was persisted, ownership is identical, and loaded changes are verified; otherwise use a fresh worker with scoped findings. Keep independent reviewers fresh and read-only; never warm-share implementer history with a reviewer. See the installed `orchestrator-mode` skill at `~/.pi/agent/skills/orchestrator-mode/SKILL.md` for the detailed workflow.

## Cache facts and caveats

- The local `.pi/settings.json` contains only `showCacheMissNotices: true`. Because `.gitignore` ignores all of `.pi/`, this project setting is local and absent from fresh clones; it is not a reproducible repository default. To recreate it or merge it into an existing file without overwriting operator keys, add only this member to the top-level JSON object (preserve all other keys):

  ```json
  {
    "showCacheMissNotices": true
  }
  ```

  Trust the reviewed project and run `/reload` before relying on project-local settings. Pi documents these notices for significant misses, successful warming, compaction usage, and provider recovery. This is diagnostic visibility, not a cache switch or performance guarantee.

- Pi's `cacheWarming` defaults to streaming, but it is global-settings-only (not project settings). Warming is eligible only when the selected model declares a cache lifetime for the active tier and Pi estimates at least $0.05 of avoided miss cost. Refresh usage contributes to session totals but is not model context. Do not invent model lifetimes or enable global idle warming for this project.
- `PI_CACHE_RETENTION=long` is an optional per-invocation environment override where the provider/model supports it, not a universal optimization. For example: `PI_CACHE_RETENTION=long pi ...`. It may have no effect for a given provider/model. In the installed `pi-ai/dist/api/openai-codex-responses.js`, `buildRequestBody` sets `prompt_cache_key` from the session ID but does not set `prompt_cache_retention`; do not document or assume that `PI_CACHE_RETENTION=long` gives this Codex path extended retention. The separate `openai-responses.js` path conditionally sets `prompt_cache_retention` for supported endpoints. Server-side caching remains best-effort, not guaranteed; no TTL is promised here.
- Providers differ in caching support, retention, cache-key behavior, and whether/how they report cache counters. The OpenAI Codex subscription provider uses a different Responses transport path from the OpenAI-compatible Chat Completions path; do not assume cache counters or semantics transfer between Codex and other providers. Missing counters mean **unknown**, not zero caching capability. Confirm the exact provider/model's reported usage and compare like with like.
- The session/footer normalized token fields distinguish uncached `input`, `cacheRead`, `cacheWrite`, and `output`. Pi's own display computes prompt tokens as `input + cacheRead + cacheWrite` and its displayed cached share as `cacheRead / prompt tokens`. This is a usage-accounting ratio, not proof that requests were equivalent or that latency/cost/correctness improved.
- Cold starts, expired provider cache, changed model/provider/system prompt/tools, compaction, and provider policy/limits can produce misses. A high hit ratio is not success by itself: also consider total tokens, latency, reported cost, and correctness.

## Offline session usage measurement

This recipe reads an existing local Pi JSONL session file only; it makes no provider call and prints no prompts, tool arguments, responses, credentials, or raw entries. Use a trusted local session file and avoid copying its contents into a report. The aggregation deliberately counts **all assistant messages in the raw file**, including inactive branches, because it does not traverse the active-leaf tree. Label results as raw-file totals; do not call them active-branch totals. Cache-warming records and compactions are reported separately and excluded from productive hit ratio.

Run from any directory with Python 3, replacing the path with a local session JSONL file:

```sh
python3 - /path/to/session.jsonl <<'PY'
import json, sys
from collections import defaultdict

path = sys.argv[1]
productive = defaultdict(lambda: {
    "calls": 0, "usage_calls": 0, "unknown_usage_calls": 0,
    "input": 0, "cacheRead": 0, "cacheWrite": 0, "output": 0,
    "cost_reported_calls": 0, "cost": 0.0,
})
compactions = warm_records = warm_input = warm_read = warm_write = warm_output = 0
warm_cost = 0.0
warm_cost_calls = 0

with open(path, encoding="utf-8") as session:
    for line in session:
        try:
            entry = json.loads(line)
        except (json.JSONDecodeError, TypeError):
            continue
        if entry.get("type") == "compaction":
            compactions += 1
        if entry.get("type") == "usage" and entry.get("kind") == "cache_warm":
            warm_records += 1
            usage = entry.get("usage") or {}
            for field, target in (("input", "warm_input"), ("cacheRead", "warm_read"),
                                  ("cacheWrite", "warm_write"), ("output", "warm_output")):
                value = usage.get(field)
                if isinstance(value, (int, float)):
                    globals()[target] += value
            cost = (usage.get("cost") or {}).get("total")
            if isinstance(cost, (int, float)):
                warm_cost += cost
                warm_cost_calls += 1
        message = entry.get("message") if entry.get("type") == "message" else None
        if not isinstance(message, dict) or message.get("role") != "assistant":
            continue
        key = (message.get("provider", "unknown"), message.get("model", "unknown"))
        row = productive[key]
        row["calls"] += 1
        usage = message.get("usage")
        fields = ("input", "cacheRead", "cacheWrite", "output")
        if not isinstance(usage, dict) or not all(isinstance(usage.get(f), (int, float)) for f in fields):
            row["unknown_usage_calls"] += 1
            continue
        row["usage_calls"] += 1
        for field in fields:
            row[field] += usage[field]
        cost = (usage.get("cost") or {}).get("total")
        if isinstance(cost, (int, float)):
            row["cost_reported_calls"] += 1
            row["cost"] += cost

for (provider, model), row in sorted(productive.items()):
    denominator = row["input"] + row["cacheRead"] + row["cacheWrite"]
    ratio = f'{100 * row["cacheRead"] / denominator:.1f}%' if denominator else "n/a"
    print(f"provider={provider} model={model} assistant_calls={row['calls']} "
          f"usage_calls={row['usage_calls']} unknown_usage_calls={row['unknown_usage_calls']} "
          f"input={row['input']} cacheRead={row['cacheRead']} cacheWrite={row['cacheWrite']} "
          f"output={row['output']} prompt_cache_read_share={ratio} "
          f"reported_cost_calls={row['cost_reported_calls']} cost_total={row['cost']:.8f}")
print(f"raw_file_compaction_entries={compactions} cache_warm_records={warm_records} "
      f"warm_input={warm_input} warm_cacheRead={warm_read} warm_cacheWrite={warm_write} "
      f"warm_output={warm_output} warm_cost_reported_records={warm_cost_calls} "
      f"warm_cost_total={warm_cost:.8f}")
PY
```

The ratio denominator is `input + cacheRead + cacheWrite`; it expresses cached reads as a share of accounted prompt tokens. It is undefined (`n/a`) when that denominator is zero. `cost_total` sums only records that reported numeric cost; `reported_cost_calls` shows how many did so. Pi's `usage.cost` is a Pi-normalized/catalog-priced estimate, not necessarily upstream billing: zero catalog cost, absent pricing, or subscription usage does not establish that a workload is free. Missing/partial usage or cost remains unknown and is not silently interpreted as zero. Usage entry handling is explicitly restricted to `kind == "cache_warm"`; other auxiliary usage entries are not productive assistant calls and are not included above.

Pi's installed interactive footer implementation uses `input + cacheRead + cacheWrite` for prompt tokens and `cacheRead / promptTokens` for the cached share (`dist/modes/interactive/components/footer.js` in the installed package). The provider's normalized `Usage` fields are provider-adapter outputs, so their availability and exact upstream interpretation remain provider-specific.

## Before/after comparison

Do not start a paid benchmark just to claim improvement. If cache impact needs evaluation, record a baseline and candidate in separate, named sessions using the same Pi version, project/cwd, exact provider/model, thinking level, tools/resources, and the same bounded representative workload. Do not include unrelated prompts or change configuration mid-comparison. Capture the workload definition and commands, mark the first request(s) as cold and later comparable requests as warm, and report those groups separately. Use the offline recipe to record raw-file usage, assistant calls, compactions, warming, and available cost; also record elapsed time and task correctness from ordinary session-level evidence without printing prompt contents. Repeat enough paired runs to reduce incidental variation and report the observed spread, not only a best run. State provider/retention limits and do not call the result a cache improvement unless baseline and candidate are comparable. Never optimize hit ratio by growing an unrelated session or hiding misses.

## Optional user-level settings (not applied)

No global Pi settings are changed by this runbook. If an operator independently chooses to enable warming, `cacheWarming` belongs in `~/.pi/agent/settings.json`, is global-only, and should be considered only for eligible models/workloads after reviewing cache lifetime and cost thresholds. This repository does not set it, alter user settings, or claim that any provider benefits.
