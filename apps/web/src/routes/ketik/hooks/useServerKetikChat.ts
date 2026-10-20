import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, KetikServerSession } from "@trainers/types";
import { KETIK_SESSION_ERRORS } from "@trainers/types";
import { ketikApi } from "../ketikApi";
import {
  boundedRandom,
  classifyTextBand,
  consumerSpeedFactor,
  isSlowEligible,
  QUIET_WINDOW_MS,
  readingMs,
  REALISTIC_RANGES,
  TRAINING_FAST_RANGES,
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
  const appendBusy = useRef(false);
  const appendBlocked = useRef(false);
  const responseBusy = useRef(false);
  const responseBlocked = useRef(false);
  const legacyPending = useRef(initial.pendingTurn);
  const responseRequestId = useRef<string | null>(
    initial.pendingResponse?.requestId ?? null,
  );
  const responseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pause = useRef<{
    timer: ReturnType<typeof setTimeout>;
    resolve: () => void;
  } | null>(null);
  const requestResponseRef = useRef<() => void>(() => {});
  const scheduleResponseRef = useRef<() => void>(() => {});
  const latestAgent = [...initial.messages]
    .reverse()
    .find((message) => message.sender === "agent");
  const lastSendAt = useRef(
    latestAgent ? Date.parse(latestAgent.timestamp) || 0 : 0,
  );

  const present = (list: ChatMessage[]) =>
    presentMessages(list, {
      open:
        current.current.state === "active" && !current.current.consumerClosed,
      queued: queued.current,
      read: read.current,
      hidden: hidden.current,
    });

  const [messages, setMessages] = useState(() =>
    presentMessages(initial.messages, {
      open: initial.state === "active" && !initial.consumerClosed,
      queued: [],
      read: new Set(),
      hidden: new Set(),
    }),
  );
  const [appendLoading, setAppendLoading] = useState(false);
  const [responseLoading, setResponseLoading] = useState(
    initial.pendingResponse?.status === "processing" ||
      initial.pendingTurn?.status === "processing",
  );
  const [typing, setTyping] = useState(
    initial.pendingResponse?.status === "processing" ||
      initial.pendingTurn?.status === "processing",
  );
  const [count, setCount] = useState(0);
  const [error, setError] = useState(
    initial.pendingResponse?.status === "failed" ||
      initial.pendingTurn?.status === "failed"
      ? KETIK_SESSION_ERRORS.SESSION_AI_FAILED
      : "",
  );
  const [retryKind, setRetryKind] = useState<"append" | "response">("response");
  const expiresAt = Date.parse(initial.expiresAt);
  const [expired, setExpired] = useState(() => Date.now() >= expiresAt);
  const [closed, setClosed] = useState(
    initial.consumerClosed || initial.state !== "active",
  );

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
      () => setExpired(true),
      Math.max(0, expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [expired, expiresAt]);

  const scheduleResponse = useCallback(() => {
    if (responseTimer.current) clearTimeout(responseTimer.current);
    responseTimer.current = null;
    const session = current.current;
    if (
      responseBusy.current ||
      responseBlocked.current ||
      appendBlocked.current ||
      queued.current.length > 0 ||
      !needsResponse(session) ||
      session.state !== "active" ||
      session.consumerClosed ||
      Date.parse(session.expiresAt) <= Date.now()
    )
      return;
    const mode = session.config.responsePacingMode;
    const factor = consumerSpeedFactor(session.config.consumerType.id);
    const texts = agentTextsSinceConsumer(session.messages, []);
    const dueAt =
      lastSendAt.current +
      Math.max(QUIET_WINDOW_MS[mode], readingMs(texts, mode) * factor);
    responseTimer.current = setTimeout(
      () => requestResponseRef.current(),
      Math.max(0, dueAt - Date.now()),
    );
  }, []);
  useEffect(() => {
    scheduleResponseRef.current = scheduleResponse;
  }, [scheduleResponse]);

  const processAppends = useCallback(async () => {
    if (
      appendBusy.current ||
      appendBlocked.current ||
      !mounted.current ||
      legacyPending.current
    )
      return;
    appendBusy.current = true;
    setAppendLoading(true);
    setError("");
    try {
      while (queued.current.length && mounted.current) {
        const session = current.current;
        if (
          session.state !== "active" ||
          session.consumerClosed ||
          Date.parse(session.expiresAt) <= Date.now()
        ) {
          setClosed(session.state !== "active" || session.consumerClosed);
          setRetryKind("append");
          setError(
            "Chat sudah ditutup atau waktu sesi berakhir. Pesan terakhir belum tersimpan.",
          );
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
          setCount(queued.current.length);
          setMessages(present(result.messages));
          setClosed(result.consumerClosed || result.state !== "active");
          // New durable context: a previously failed reply attempt may run again.
          responseBlocked.current = false;
        } catch {
          appendBlocked.current = true;
          setRetryKind("append");
          setError("Pesan belum tersimpan. Coba kirim lagi.");
          break;
        }
      }
    } finally {
      appendBusy.current = false;
      if (mounted.current) {
        setAppendLoading(false);
        if (!queued.current.length) scheduleResponseRef.current();
      }
    }
  }, [initial.id]);

  const requestResponse = useCallback(async () => {
    if (
      responseBusy.current ||
      responseBlocked.current ||
      appendBusy.current ||
      queued.current.length > 0 ||
      !mounted.current
    ) {
      scheduleResponseRef.current();
      return;
    }
    const session = current.current;
    if (!needsResponse(session)) return;
    responseBusy.current = true;
    setResponseLoading(true);
    setError("");
    for (const message of session.messages)
      if (message.sender === "agent") read.current.add(message.id);
    setMessages((previous) => present(previous));
    setTyping(true);
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
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        pause.current = {
          timer: setTimeout(
            () => {
              pause.current = null;
              resolve();
            },
            Math.max(0, ms),
          ),
          resolve,
        };
      });
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
      setMessages(present(result.messages));
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
          hidden.current.delete(reply.id);
          setMessages(present(current.current.messages));
          showAt = Math.max(showAt, Date.now());
        }
      }
      setClosed(result.consumerClosed || result.state !== "active");
    } catch {
      if (!mounted.current) return;
      responseBlocked.current = true;
      setRetryKind("response");
      setError(KETIK_SESSION_ERRORS.SESSION_AI_FAILED);
    } finally {
      responseBusy.current = false;
      hidden.current.clear();
      if (mounted.current) {
        setTyping(false);
        setResponseLoading(false);
        // Re-render from the authoritative session so an interrupted reveal
        // never leaves a published reply invisible.
        setMessages(present(current.current.messages));
        // A message appended during the request/reveal still needs its reply.
        scheduleResponseRef.current();
      }
    }
  }, [initial.id]);
  useEffect(() => {
    requestResponseRef.current = () => void requestResponse();
  }, [requestResponse]);

  // Recover a response (or a pre-deployment legacy turn) already in flight.
  useEffect(() => {
    const processing =
      initial.pendingResponse?.status === "processing" ||
      initial.pendingTurn?.status === "processing";
    if (!processing) {
      if (needsResponse(initial)) scheduleResponseRef.current();
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const loaded = await ketikApi.getSession(initial.id);
        if (cancelled) return;
        current.current = loaded;
        setMessages(present(loaded.messages));
        setClosed(loaded.consumerClosed || loaded.state !== "active");
        const stillProcessing =
          loaded.pendingResponse?.status === "processing" ||
          loaded.pendingTurn?.status === "processing";
        if (!stillProcessing) {
          legacyPending.current = null;
          setTyping(false);
          setResponseLoading(false);
          responseRequestId.current =
            loaded.pendingResponse?.status === "failed"
              ? loaded.pendingResponse.requestId
              : null;
          if (
            loaded.pendingResponse?.status === "failed" ||
            loaded.pendingTurn?.status === "failed"
          ) {
            responseBlocked.current = true;
            setRetryKind("response");
            setError(KETIK_SESSION_ERRORS.SESSION_AI_FAILED);
          } else if (queued.current.length) {
            void processAppends();
          } else if (needsResponse(loaded)) {
            scheduleResponseRef.current();
          }
          return;
        }
        timer = setTimeout(() => void poll(), 2000);
      } catch {
        if (!cancelled) {
          setTyping(false);
          setResponseLoading(false);
          setRetryKind("response");
          setError("Status balasan belum bisa dimuat. Coba lagi.");
        }
      }
    };
    timer = setTimeout(() => void poll(), 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [initial, initial.id, processAppends]);

  const send = (text: string) => {
    if (closed || expired || queued.current.length >= 20) {
      setRetryKind("append");
      setError(
        expired
          ? KETIK_SESSION_ERRORS.SESSION_EXPIRED
          : "Antrean penyimpanan penuh atau chat sudah ditutup.",
      );
      return false;
    }
    if (responseTimer.current) clearTimeout(responseTimer.current);
    lastSendAt.current = Date.now();
    queued.current.push({
      requestId: crypto.randomUUID(),
      text,
      sentAt: new Date().toISOString(),
    });
    setCount(queued.current.length);
    setMessages((previous) => present(previous));
    void processAppends();
    return true;
  };

  const retry = () => {
    setError("");
    if (initial.pendingTurn?.status === "failed") {
      setResponseLoading(true);
      const { requestId, text, expectedVersion } = initial.pendingTurn;
      void ketikApi
        .sendTurn(initial.id, { requestId, text, expectedVersion })
        .then((loaded) => {
          legacyPending.current = null;
          current.current = loaded;
          setMessages(present(loaded.messages));
          setResponseLoading(false);
          if (queued.current.length) void processAppends();
          else if (needsResponse(loaded)) scheduleResponseRef.current();
        })
        .catch(() => {
          setResponseLoading(false);
          setError(KETIK_SESSION_ERRORS.SESSION_AI_FAILED);
        });
      return;
    }
    if (retryKind === "append") {
      appendBlocked.current = false;
      void processAppends();
    } else {
      responseBlocked.current = false;
      void requestResponse();
    }
  };

  return {
    messages,
    isLoading: appendLoading || responseLoading,
    isConsumerTyping: typing,
    queuedCount: count,
    error,
    retry,
    retryLabel:
      retryKind === "append" ? "Coba simpan lagi" : "Coba minta balasan lagi",
    send,
    sessionPhase: closed
      ? ("closed" as const)
      : expired
        ? ("expired" as const)
        : ("active" as const),
  };
}
