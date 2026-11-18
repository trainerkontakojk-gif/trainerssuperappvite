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
  quietWindowMs,
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

function agentTextsSinceConsumer(messages: readonly ChatMessage[]): string[] {
  const texts: string[] = [];
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.sender === "consumer") break;
    if (message.sender === "agent") texts.unshift(message.text);
  }
  return texts;
}

function presentMessages(
  list: ChatMessage[],
  state: {
    open: boolean;
    queued: QueuedMessage[];
    read: Set<string>;
  },
) {
  const known = new Set(list.map((message) => message.id));
  const all: ChatMessage[] = [
    ...list,
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

function lastAgentTimestamp(session: KetikServerSession): number {
  for (let index = session.messages.length - 1; index >= 0; index--) {
    const message = session.messages[index];
    if (message.sender === "agent") return Date.parse(message.timestamp) || 0;
  }
  return 0;
}

function mergeResponseSnapshot(
  current: KetikServerSession,
  received: KetikServerSession,
) {
  return received.state === "active" && received.version < current.version
    ? { ...current, pendingResponse: received.pendingResponse }
    : received;
}

function heldReplyDeadline(
  session: KetikServerSession,
  slow: { total: number; consecutive: number },
): number | null {
  const held = session.pendingResponse;
  if (held?.status !== "held") return null;
  const now = Date.now();
  const mode = session.config.responsePacingMode;
  const factor = consumerSpeedFactor(session.config.consumerType.id);
  const turns = session.messages.filter(
    (message) => message.sender === "consumer",
  ).length;
  const remaining = (Date.parse(session.expiresAt) - now) / 1000;
  let band =
    turns === 0 ? "greeting_reply" : classifyTextBand(held.typingChars);
  if (
    mode === "realistic" &&
    isSlowEligible({
      consumerTurnIndex: turns,
      consecutiveSlowCount: slow.consecutive,
      totalSlowCount: slow.total,
      sessionDurationMinutes: session.config.simulationDuration,
      remainingSeconds: remaining,
      elapsedSeconds: (now - Date.parse(session.startedAt)) / 1000,
      totalDurationSeconds: session.config.simulationDuration * 60,
    })
  ) {
    band = "slow";
    slow.total++;
    slow.consecutive++;
  } else {
    slow.consecutive = 0;
  }
  const ranges =
    mode === "training_fast" ? TRAINING_FAST_RANGES : REALISTIC_RANGES;
  const range = ranges[band]!;
  return (
    now +
    (remaining < 20
      ? boundedRandom(1000, 3000)
      : boundedRandom(range.minMs, range.maxMs) * factor)
  );
}

export function useServerKetikChat(initial: KetikServerSession) {
  const current = useRef(initial);
  const mounted = useRef(true);
  const queued = useRef<QueuedMessage[]>([]);
  const read = useRef(new Set<string>());
  /** Slow-reply bookkeeping: a rarer, longer think per session. */
  const slow = useRef({ total: 0, consecutive: 0 });
  const [state, dispatch] = useReducer(
    chatReducer,
    initial,
    (session): ChatState => {
      const pending = session.pendingResponse ?? session.pendingTurn;
      const revealAt = heldReplyDeadline(session, { total: 0, consecutive: 0 });
      return {
        revealAt: revealAt ?? 0,
        append: { status: "idle" },
        legacy: session.pendingTurn,
        response:
          revealAt !== null
            ? "holding"
            : pending?.status === "processing"
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
  const agentDraft = useRef<AgentDraftState>({ active: false, at: 0 });
  /** Closing requests the server did not answer with a goodbye yet. */
  const closingAttempts = useRef(0);
  const requestResponseRef = useRef<() => void>(() => {});
  const scheduleResponseRef = useRef<() => void>(() => {});
  const lastSendAt = useRef(lastAgentTimestamp(initial));

  const refreshMessages = useCallback(
    () =>
      transition({
        type: "present",
        messages: presentMessages(current.current.messages, {
          open: current.current.state === "active",
          queued: queued.current,
          read: read.current,
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
    if (wasActive && !active) scheduleResponseRef.current();
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (responseTimer.current) clearTimeout(responseTimer.current);
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
    const chat = lifecycle.current;
    if (
      (chat.response !== "idle" && chat.response !== "holding") ||
      chat.append.status !== "idle" ||
      queued.current.length > 0 ||
      session.state !== "active" ||
      session.consumerClosed
    )
      return;

    const closing = owesClosing(session);
    const pending = session.pendingResponse;
    const held = pending?.status === "held" ? pending : null;
    if (!held && !closing && !needsResponse(session)) return;

    const mode = session.config.responsePacingMode;
    const factor = consumerSpeedFactor(session.config.consumerType.id);
    const lastSent = Math.max(lastSendAt.current, lastAgentTimestamp(session));
    const quietUntil =
      lastSent +
      Math.max(
        quietWindowMs(mode),
        readingMs(agentTextsSinceConsumer(session.messages), mode) * factor,
      );
    const changed = held && held.contextAgentVersion !== session.agentVersion;
    const needsRetry = changed && held?.retryCount === 0;
    let dueAt = Math.max(quietUntil, held && !needsRetry ? chat.revealAt : 0);
    if (closing) {
      if (held?.closing) {
        dueAt = Math.max(
          changed ? quietUntil : 0,
          needsRetry ? 0 : chat.revealAt,
        );
      } else if (pending?.status !== "retry_ready") {
        // A browser clock ahead of the server may receive a no-op.
        dueAt = Date.now() + (closingAttempts.current ? 2000 : 0);
      }
    }
    const expires = Date.parse(session.expiresAt);
    const holdUntil = Math.min(dueAt + MAX_TYPING_HOLD_MS[mode], expires);
    const requestWhenReady = () => {
      responseTimer.current = null;
      const now = Date.now();
      const draft = agentDraft.current;
      if (
        expires - now >= TYPING_HOLD_EXPIRY_THRESHOLD_MS &&
        now < holdUntil &&
        isAgentTyping(draft, now)
      ) {
        const nextAt = Math.min(draft.at + DRAFT_IDLE_MS, holdUntil);
        responseTimer.current = setTimeout(requestWhenReady, nextAt - now);
        return;
      }
      requestResponseRef.current();
    };
    responseTimer.current = setTimeout(
      requestWhenReady,
      Math.max(0, (closing ? dueAt : Math.min(dueAt, expires)) - Date.now()),
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
          if (result.version >= current.current.version) {
            current.current = {
              ...result,
              pendingResponse: current.current.pendingResponse,
            };
          }
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

  const syncResponse = useCallback(
    (loaded: KetikServerSession, prior: KetikServerSession) => {
      const next = loaded.pendingResponse;
      const previous = prior.pendingResponse;
      responseRequestId.current = next?.requestId ?? null;
      if (next?.status === "failed") {
        transition({ type: "response-failed" });
      } else if (next?.status === "held") {
        const sameHold =
          previous?.status === "held" &&
          next.requestId === previous.requestId &&
          next.retryCount === previous.retryCount;
        transition({
          type: "response-ready",
          revealAt:
            sameHold && lifecycle.current.revealAt
              ? lifecycle.current.revealAt
              : heldReplyDeadline(loaded, slow.current),
        });
      } else {
        transition({ type: "response-ready", revealAt: null });
      }
    },
    [transition],
  );

  const requestResponse = useCallback(async () => {
    const chat = lifecycle.current;
    if (
      (chat.response !== "idle" && chat.response !== "holding") ||
      chat.append.status !== "idle" ||
      queued.current.length > 0 ||
      !mounted.current
    )
      return;

    const session = current.current;
    if (session.state !== "active" || session.consumerClosed) return;
    if (!needsResponse(session) && !owesClosing(session)) return;
    const pending = session.pendingResponse;
    const held = pending?.status === "held" ? pending : null;
    if (!held && owesClosing(session)) closingAttempts.current++;
    transition({ type: held ? "reveal-start" : "response-start" });
    for (const message of session.messages)
      if (message.sender === "agent") read.current.add(message.id);
    refreshMessages();
    const requestId =
      session.pendingResponse?.requestId ??
      responseRequestId.current ??
      crypto.randomUUID();
    responseRequestId.current = requestId;
    try {
      const result = held
        ? await ketikApi.revealResponse(initial.id, {
            requestId,
            expectedAgentVersion: session.agentVersion,
            expectedRetryCount: held.retryCount,
          })
        : await ketikApi.requestResponse(initial.id, { requestId });
      if (!mounted.current) return;
      const loaded = mergeResponseSnapshot(current.current, result);
      current.current = loaded;
      transition({
        type: "session",
        closed: loaded.consumerClosed || loaded.state !== "active",
      });
      syncResponse(loaded, session);
    } catch {
      if (mounted.current) transition({ type: "response-failed" });
    } finally {
      if (mounted.current) {
        refreshMessages();
        scheduleResponseRef.current();
      }
    }
  }, [initial.id, refreshMessages, syncResponse, transition]);
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
        const previous = current.current;
        current.current = mergeResponseSnapshot(previous, loaded);
        refreshMessages();
        transition({
          type: "session",
          closed: loaded.consumerClosed || loaded.state !== "active",
        });
        const stillProcessing =
          loaded.pendingResponse?.status === "processing" ||
          loaded.pendingTurn?.status === "processing";
        if (!stillProcessing) {
          transition({ type: "recovery-finished", turn: loaded.pendingTurn });
          syncResponse(current.current, previous);
          if (loaded.pendingTurn?.status === "failed") {
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
  }, [
    initial.id,
    state.response,
    processAppends,
    refreshMessages,
    syncResponse,
    transition,
  ]);

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
      ["recovering", "requesting", "publishing", "legacy-retrying"].includes(
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
      if (current.current.pendingResponse?.status === "held") {
        scheduleResponseRef.current();
      } else {
        void requestResponse();
      }
    }
  };

  return {
    messages: state.messages,
    isLoading:
      state.append.status === "saving" ||
      ["recovering", "requesting", "publishing", "legacy-retrying"].includes(
        state.response,
      ),
    isConsumerTyping: [
      "recovering",
      "requesting",
      "holding",
      "publishing",
    ].includes(state.response),
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
