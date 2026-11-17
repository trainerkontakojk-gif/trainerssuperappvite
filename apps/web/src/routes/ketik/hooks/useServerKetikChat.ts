import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ChatMessage, KetikServerSession } from "@trainers/types";
import { KETIK_SESSION_ERRORS } from "@trainers/types";
import { ketikApi } from "../ketikApi";
import { chatReducer, type ChatEvent, type ChatState } from "./chatLifecycle";
import {
  boundedRandom,
  classifyTextBand,
  consumerSpeedFactor,
  DRAFT_IDLE_MS,
  isSlowEligible,
  MAX_TYPING_HOLD_MS,
  QUIET_WINDOW_MS,
  readingMs,
  REALISTIC_RANGES,
  TRAINING_FAST_RANGES,
  TYPING_HOLD_EXPIRY_THRESHOLD_MS,
} from "../lib/pacing";

interface QueuedMessage {
  requestId: string;
  text: string;
  sentAt: string;
}

function needsResponse(session: KetikServerSession): boolean {
  if (typeof session.awaitingResponse === "boolean")
    return session.awaitingResponse;
  return (
    [...session.messages]
      .reverse()
      .find((message) => message.sender !== "system")?.sender === "agent"
  );
}

/**
 * Once the time is up the consumer owes one goodbye, even when it spoke last;
 * after that nothing the agent sends gets a reply.
 */
function owesClosing(session: KetikServerSession): boolean {
  return (
    session.state === "active" &&
    !session.consumerClosed &&
    Date.parse(session.expiresAt) <= Date.now()
  );
}

interface AgentDraftState {
  active: boolean;
  at: number;
}

function isAgentTyping(draft: AgentDraftState, now: number): boolean {
  return draft.active && now - draft.at < DRAFT_IDLE_MS;
}

function agentTextsSinceConsumer(
  messages: readonly ChatMessage[],
  queued: readonly QueuedMessage[],
): string[] {
  const texts: string[] = [];
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.sender === "consumer") break;
    if (message.sender === "agent") texts.unshift(message.text);
  }
  return [...texts, ...queued.map((message) => message.text)];
}

/**
 * Server messages plus not-yet-acknowledged agent bubbles and delivery ticks.
 *
 * `hidden` holds consumer replies that a response already published but that
 * are still being "typed"; they are dropped from every render until their own
 * reveal moment, so a concurrent append cannot leak them early.
 */
function presentMessages(
  list: ChatMessage[],
  state: {
    open: boolean;
    queued: QueuedMessage[];
    read: Set<string>;
    hidden: ReadonlySet<string>;
  },
) {
  const known = new Set(list.map((message) => message.id));
  const all: ChatMessage[] = [
    ...list.filter((message) => !state.hidden.has(message.id)),
    ...state.queued
      .filter((message) => state.open && !known.has(message.requestId))
      .map((message) => ({
        id: message.requestId,
        sender: "agent" as const,
        text: message.text,
        timestamp: message.sentAt,
      })),
  ];
  let repliedAfter = false;
  for (let index = all.length - 1; index >= 0; index--) {
    const message = all[index];
    if (message.sender === "consumer") repliedAfter = true;
    if (message.sender !== "agent") continue;
    all[index] = {
      ...message,
      status:
        repliedAfter || state.read.has(message.id)
          ? "read"
          : known.has(message.id)
            ? "delivered"
            : "sent",
    };
  }
  return all;
}

/**
 * Persists every agent message immediately, then requests one consumer response
 * after the agent pauses. The response service discards and regenerates once if
 * another durable agent message arrives while AI generation is in flight.
 *
 * The replies that response publishes are still typed out one at a time: the
 * consumer reads everything since its last reply, then types each message for
 * as long as it would take a person, exactly like before replies moved to their
 * own endpoint. Otherwise a fast AI would answer a long reply in one second.
 */
export function useServerKetikChat(initial: KetikServerSession) {
  const current = useRef(initial);
  const mounted = useRef(true);
  const queued = useRef<QueuedMessage[]>([]);
  const read = useRef(new Set<string>());
  /** Published consumer replies that are still waiting for their reveal. */
  const hidden = useRef(new Set<string>());
  /** Slow-reply bookkeeping: a rarer, longer think per session. */
  const slow = useRef({ total: 0, consecutive: 0 });
  const [state, dispatch] = useReducer(
    chatReducer,
    initial,
    (session): ChatState => {
      const pending = session.pendingResponse ?? session.pendingTurn;
      return {
        append: { status: "idle" },
        legacy: session.pendingTurn,
        response:
          pending?.status === "processing"
            ? "recovering"
            : pending?.status === "failed"
              ? "blocked"
              : "idle",
        phase:
          session.consumerClosed || session.state !== "active"
            ? "closed"
            : Date.now() >= Date.parse(session.expiresAt)
              ? "expired"
              : "active",
        messages: presentMessages(session.messages, {
          open: session.state === "active",
          queued: [],
          read: new Set(),
          hidden: new Set(),
        }),
        queuedCount: 0,
        error:
          pending?.status === "failed"
            ? {
                kind: "response",
                message: KETIK_SESSION_ERRORS.SESSION_AI_FAILED,
              }
            : null,
      };
    },
  );
  // Synchronous mirror for reentrant timers/async guards. React and scheduler
  // use the same pure transitions, not separate busy/blocked flags.
  const lifecycle = useRef(state);
  const transition = useCallback((event: ChatEvent) => {
    lifecycle.current = chatReducer(lifecycle.current, event);
    dispatch(event);
  }, []);
  const responseRequestId = useRef<string | null>(
    initial.pendingResponse?.requestId ?? null,
  );
  const responseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pause = useRef<{
    timer: ReturnType<typeof setTimeout>;
    resolve: () => void;
    draftHold: boolean;
  } | null>(null);
  const agentDraft = useRef<AgentDraftState>({ active: false, at: 0 });
  /** Closing requests the server did not answer with a goodbye yet. */
  const closingAttempts = useRef(0);
  const requestResponseRef = useRef<() => void>(() => {});
  const scheduleResponseRef = useRef<() => void>(() => {});
  const latestAgent = [...initial.messages]
    .reverse()
    .find((message) => message.sender === "agent");
  const lastSendAt = useRef(
    latestAgent ? Date.parse(latestAgent.timestamp) || 0 : 0,
  );

  const refreshMessages = useCallback(
    () =>
      transition({
        type: "present",
        messages: presentMessages(current.current.messages, {
          open: current.current.state === "active",
          queued: queued.current,
          read: read.current,
          hidden: hidden.current,
        }),
        queuedCount: queued.current.length,
      }),
    [transition],
  );
  const expiresAt = Date.parse(initial.expiresAt);
  const expired = state.phase !== "active";

  const noteDraft = useCallback((text: string) => {
    const wasActive = agentDraft.current.active;
    const active = text.trim().length > 0;
    agentDraft.current = { active, at: Date.now() };
    if (wasActive && !active) {
      scheduleResponseRef.current();
      if (pause.current?.draftHold) {
        const pending = pause.current;
        clearTimeout(pending.timer);
        pause.current = null;
        pending.resolve();
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (responseTimer.current) clearTimeout(responseTimer.current);
      if (pause.current) {
        clearTimeout(pause.current.timer);
        pause.current.resolve();
        pause.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (expired) return;
    const timer = setTimeout(
      () => {
        transition({ type: "expire" });
        scheduleResponseRef.current();
      },
      Math.max(0, expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [expired, expiresAt, transition]);

  const scheduleResponse = useCallback(() => {
    if (responseTimer.current) clearTimeout(responseTimer.current);
    responseTimer.current = null;
    const session = current.current;
    if (
      lifecycle.current.response !== "idle" ||
      lifecycle.current.append.status === "blocked" ||
      queued.current.length > 0 ||
      session.state !== "active" ||
      session.consumerClosed
    )
      return;
    if (owesClosing(session)) {
      // A browser clock ahead of the server gets a no-op until the server
      // agrees the time is up; retry slowly instead of in a tight loop.
      responseTimer.current = setTimeout(
        () => requestResponseRef.current(),
        closingAttempts.current ? 2000 : 0,
      );
      return;
    }
    if (!needsResponse(session)) return;
    const mode = session.config.responsePacingMode;
    const factor = consumerSpeedFactor(session.config.consumerType.id);
    const texts = agentTextsSinceConsumer(session.messages, []);
    const dueAt =
      lastSendAt.current +
      Math.max(QUIET_WINDOW_MS[mode] * factor, readingMs(texts, mode) * factor);
    const holdUntil = Math.min(
      dueAt + MAX_TYPING_HOLD_MS[mode],
      Date.parse(session.expiresAt),
    );
    const requestWhenReady = () => {
      responseTimer.current = null;
      const now = Date.now();
      const latest = current.current;
      const remainingMs = Date.parse(latest.expiresAt) - now;
      const draft = agentDraft.current;
      if (
        !owesClosing(latest) &&
        remainingMs >= TYPING_HOLD_EXPIRY_THRESHOLD_MS &&
        now < holdUntil &&
        isAgentTyping(draft, now)
      ) {
        const nextAt = Math.min(draft.at + DRAFT_IDLE_MS, holdUntil);
        responseTimer.current = setTimeout(
          requestWhenReady,
          Math.max(0, nextAt - now),
        );
        return;
      }
      requestResponseRef.current();
    };
    responseTimer.current = setTimeout(
      requestWhenReady,
      Math.max(0, dueAt - Date.now()),
    );
  }, []);
  useEffect(() => {
    scheduleResponseRef.current = scheduleResponse;
  }, [scheduleResponse]);

  const processAppends = useCallback(async () => {
    if (
      lifecycle.current.append.status !== "idle" ||
      !mounted.current ||
      lifecycle.current.legacy !== null
    )
      return;
    transition({ type: "append-start" });
    try {
      while (queued.current.length && mounted.current) {
        // The agent may still close politely after the time is up or the
        // consumer left; only an ended session stops saving.
        const session = current.current;
        if (session.state !== "active") {
          transition({ type: "session", closed: true });
          transition({
            type: "append-failed",
            message: "Chat sudah diakhiri. Pesan terakhir belum tersimpan.",
          });
          break;
        }
        const next = queued.current[0];
        try {
          const result = await ketikApi.appendMessage(initial.id, {
            requestId: next.requestId,
            expectedAgentVersion: session.agentVersion ?? 0,
            text: next.text,
          });
          if (!mounted.current) return;
          current.current = result;
          queued.current.shift();
          refreshMessages();
          transition({
            type: "session",
            closed: result.consumerClosed || result.state !== "active",
          });
          transition({ type: "append-saved" });
        } catch {
          if (mounted.current)
            transition({
              type: "append-failed",
              message: "Pesan belum tersimpan. Coba kirim lagi.",
            });
          break;
        }
      }
    } finally {
      if (mounted.current) {
        transition({ type: "append-finish" });
        if (!queued.current.length) scheduleResponseRef.current();
      }
    }
  }, [initial.id, refreshMessages, transition]);

  const requestResponse = useCallback(async () => {
    if (
      lifecycle.current.response !== "idle" ||
      lifecycle.current.append.status !== "idle" ||
      queued.current.length > 0 ||
      !mounted.current
    ) {
      scheduleResponseRef.current();
      return;
    }
    const session = current.current;
    if (session.state !== "active" || session.consumerClosed) return;
    if (!needsResponse(session) && !owesClosing(session)) return;
    if (owesClosing(session)) closingAttempts.current++;
    transition({ type: "response-start" });
    for (const message of session.messages)
      if (message.sender === "agent") read.current.add(message.id);
    refreshMessages();
    // The consumer reads everything since its last reply before typing, so the
    // pacing clock starts there — not when the AI happens to finish.
    const mode = session.config.responsePacingMode;
    const factor = consumerSpeedFactor(session.config.consumerType.id);
    const readEnd =
      lastSendAt.current +
      readingMs(agentTextsSinceConsumer(session.messages, []), mode) * factor;
    const knownIds = new Set(session.messages.map((message) => message.id));
    const previousConsumerCount = session.messages.filter(
      (message) => message.sender === "consumer",
    ).length;
    /** Resolves early on unmount, so a pending reveal never leaks a timer. */
    const wait = (ms: number, draftHold = false) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(
          () => {
            if (pause.current?.timer === timer) {
              pause.current = null;
            }
            resolve();
          },
          Math.max(0, ms),
        );
        pause.current = {
          timer,
          resolve,
          draftHold,
        };
      });
    const waitForAgentIdle = async (holdUntil: number) => {
      while (mounted.current) {
        const now = Date.now();
        const latest = current.current;
        const remainingMs = Date.parse(latest.expiresAt) - now;
        const draft = agentDraft.current;
        if (
          owesClosing(latest) ||
          remainingMs < TYPING_HOLD_EXPIRY_THRESHOLD_MS ||
          now >= holdUntil ||
          !isAgentTyping(draft, now)
        )
          return;
        const nextAt = Math.min(draft.at + DRAFT_IDLE_MS, holdUntil);
        await wait(Math.max(0, nextAt - now), true);
      }
    };
    const requestId = responseRequestId.current ?? crypto.randomUUID();
    responseRequestId.current = requestId;
    try {
      const result = await ketikApi.requestResponse(initial.id, { requestId });
      if (!mounted.current) return;
      current.current = result;
      responseRequestId.current = null;
      // Replies published by this response, held back until their reveal.
      const replies = result.messages.filter(
        (message) => message.sender === "consumer" && !knownIds.has(message.id),
      );
      for (const reply of replies) hidden.current.add(reply.id);
      transition({ type: "response-published" });
      refreshMessages();
      if (replies.length > 0) {
        const ranges =
          mode === "training_fast" ? TRAINING_FAST_RANGES : REALISTIC_RANGES;
        const remaining = Math.max(
          0,
          (Date.parse(result.expiresAt) - Date.now()) / 1000,
        );
        let firstBand: string =
          previousConsumerCount === 0
            ? "greeting_reply"
            : classifyTextBand(replies[0]!.text.length);
        if (
          mode !== "training_fast" &&
          isSlowEligible({
            consumerTurnIndex: previousConsumerCount,
            consecutiveSlowCount: slow.current.consecutive,
            totalSlowCount: slow.current.total,
            sessionDurationMinutes: result.config.simulationDuration,
            remainingSeconds: remaining,
            elapsedSeconds: (Date.now() - Date.parse(result.startedAt)) / 1000,
            totalDurationSeconds: result.config.simulationDuration * 60,
          })
        ) {
          firstBand = "slow";
          slow.current.total++;
          slow.current.consecutive++;
        } else {
          slow.current.consecutive = 0;
        }
        let showAt = readEnd;
        for (const [index, reply] of replies.entries()) {
          const range = ranges[index === 0 ? firstBand : "follow_up"]!;
          showAt += boundedRandom(range.minMs, range.maxMs) * factor;
          let planned = Math.max(0, showAt - Date.now());
          if (remaining < 20) planned = boundedRandom(1000, 3000);
          else if (planned > remaining * 1000 - 5000)
            planned = boundedRandom(
              1000,
              Math.max(1000, remaining * 1000 - 5000),
            );
          await wait(
            Math.min(planned, Date.parse(result.expiresAt) - Date.now()),
          );
          if (!mounted.current) return;
          const revealHoldUntil = Math.min(
            showAt + MAX_TYPING_HOLD_MS[mode],
            Date.parse(result.expiresAt) - 5000,
          );
          await waitForAgentIdle(revealHoldUntil);
          if (!mounted.current) return;
          hidden.current.delete(reply.id);
          refreshMessages();
          showAt = Math.max(showAt, Date.now());
        }
      }
      transition({
        type: "session",
        closed: result.consumerClosed || result.state !== "active",
      });
    } catch {
      if (!mounted.current) return;
      transition({ type: "response-failed" });
    } finally {
      hidden.current.clear();
      if (mounted.current) {
        transition({ type: "response-finish" });
        // Re-render from the authoritative session so an interrupted reveal
        // never leaves a published reply invisible.
        refreshMessages();
        // A message appended during the request/reveal still needs its reply.
        scheduleResponseRef.current();
      }
    }
  }, [initial.id, refreshMessages, transition]);
  useEffect(() => {
    requestResponseRef.current = () => void requestResponse();
  }, [requestResponse]);

  // Recover a response (or a pre-deployment legacy turn) already in flight.
  useEffect(() => {
    if (state.response !== "recovering") {
      scheduleResponseRef.current();
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const loaded = await ketikApi.getSession(initial.id);
        if (cancelled) return;
        current.current = loaded;
        refreshMessages();
        transition({
          type: "session",
          closed: loaded.consumerClosed || loaded.state !== "active",
        });
        const stillProcessing =
          loaded.pendingResponse?.status === "processing" ||
          loaded.pendingTurn?.status === "processing";
        if (!stillProcessing) {
          transition({ type: "legacy-recovered", turn: loaded.pendingTurn });
          responseRequestId.current =
            loaded.pendingResponse?.status === "failed"
              ? loaded.pendingResponse.requestId
              : null;
          if (
            loaded.pendingResponse?.status === "failed" ||
            loaded.pendingTurn?.status === "failed"
          ) {
            transition({ type: "response-failed" });
          } else if (queued.current.length) {
            void processAppends();
          } else {
            scheduleResponseRef.current();
          }
          return;
        }
        timer = setTimeout(() => void poll(), 2000);
      } catch {
        if (!cancelled) {
          transition({ type: "recovery-failed" });
        }
      }
    };
    timer = setTimeout(() => void poll(), 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [initial.id, state.response, processAppends, refreshMessages, transition]);

  const send = (text: string) => {
    if (current.current.state !== "active" || queued.current.length >= 20) {
      transition({
        type: "send-refused",
        message: "Antrean penyimpanan penuh atau chat sudah diakhiri.",
      });
      return false;
    }
    if (responseTimer.current) clearTimeout(responseTimer.current);
    lastSendAt.current = Date.now();
    queued.current.push({
      requestId: crypto.randomUUID(),
      text,
      sentAt: new Date().toISOString(),
    });
    refreshMessages();
    void processAppends();
    return true;
  };

  const retry = () => {
    if (lifecycle.current.append.status === "blocked") {
      transition({ type: "append-retry" });
      void processAppends();
      return;
    }
    if (
      ["recovering", "requesting", "revealing", "legacy-retrying"].includes(
        lifecycle.current.response,
      )
    )
      return;
    if (lifecycle.current.response === "recovery-failed") {
      transition({ type: "response-retry" });
      return;
    }
    const legacy = lifecycle.current.legacy;
    if (legacy?.status === "failed") {
      transition({ type: "legacy-retry" });
      const { requestId, text, expectedVersion } = legacy;
      void ketikApi
        .sendTurn(initial.id, { requestId, text, expectedVersion })
        .then((loaded) => {
          if (!mounted.current) return;
          current.current = loaded;
          refreshMessages();
          transition({
            type: "session",
            closed: loaded.consumerClosed || loaded.state !== "active",
          });
          transition({ type: "legacy-finished" });
          if (queued.current.length) void processAppends();
          else scheduleResponseRef.current();
        })
        .catch(() => {
          if (mounted.current) transition({ type: "response-failed" });
        });
      return;
    }
    if (lifecycle.current.error?.kind === "append") {
      transition({ type: "append-retry" });
      void processAppends();
    } else {
      transition({ type: "response-retry" });
      void requestResponse();
    }
  };

  return {
    messages: state.messages,
    isLoading:
      state.append.status === "saving" ||
      ["recovering", "requesting", "revealing", "legacy-retrying"].includes(
        state.response,
      ),
    isConsumerTyping: ["recovering", "requesting", "revealing"].includes(
      state.response,
    ),
    queuedCount: state.queuedCount,
    error:
      state.append.status === "blocked"
        ? state.append.message
        : (state.error?.message ?? ""),
    retry,
    retryLabel:
      state.append.status === "blocked" || state.error?.kind === "append"
        ? "Coba simpan lagi"
        : "Coba minta balasan lagi",
    send,
    noteDraft,
    sessionPhase: state.phase,
  };
}
