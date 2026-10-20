import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatMessage,
  KetikServerSession,
  KetikSessionTurnRequest,
} from "@trainers/types";
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

/** Agent messages since the consumer's last reply, without the turn being sent. */
function pendingAgentTexts(session: KetikServerSession, excludeId: string) {
  const texts: string[] = [];
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const message = session.messages[i];
    if (message.sender === "consumer") break;
    if (message.sender === "agent" && message.id !== excludeId)
      texts.unshift(message.text);
  }
  return texts;
}

interface QueuedTurn {
  requestId: string;
  text: string;
  sentAt: string;
}

/**
 * Server messages plus queued agent bubbles, each agent bubble with its tick:
 * sent (browser only), delivered (stored), read (consumer read or replied).
 * Once the chat is closed, unsent queued text is no longer part of it.
 */
function presentMessages(
  list: ChatMessage[],
  state: {
    open: boolean;
    queued: QueuedTurn[];
    acked: Set<string>;
    read: Set<string>;
  },
) {
  const known = new Set(list.map((m) => m.id));
  const all: ChatMessage[] = [
    ...list,
    ...state.queued
      .filter((q) => state.open && !known.has(q.requestId))
      .map((q) => ({
        id: q.requestId,
        sender: "agent" as const,
        text: q.text,
        timestamp: q.sentAt,
      })),
  ];
  let repliedAfter = false;
  for (let i = all.length - 1; i >= 0; i--) {
    const m = all[i];
    if (m.sender === "consumer") repliedAfter = true;
    if (m.sender !== "agent") continue;
    const status =
      repliedAfter || state.read.has(m.id)
        ? "read"
        : state.queued.some((q) => q.requestId === m.id) &&
            !state.acked.has(m.id)
          ? "sent"
          : "delivered";
    all[i] = { ...m, status };
  }
  return all;
}

/** One ordered queue; typing/send stays available while a turn is in flight. */
export function useServerKetikChat(initial: KetikServerSession) {
  const current = useRef(initial);
  const slow = useRef({ total: 0, consecutive: 0 });
  const mounted = useRef(true);
  const queue = useRef<QueuedTurn[]>(
    initial.pendingTurn
      ? [
          {
            requestId: initial.pendingTurn.requestId,
            text: initial.pendingTurn.text,
            sentAt: new Date().toISOString(),
          },
        ]
      : [],
  );
  // Agent messages the server has stored, and those the consumer has read.
  const acked = useRef(
    new Set(initial.pendingTurn ? [initial.pendingTurn.requestId] : []),
  );
  const read = useRef(new Set<string>());
  const present = (list: ChatMessage[]) =>
    presentMessages(list, {
      open:
        current.current.state === "active" && !current.current.consumerClosed,
      queued: queue.current,
      acked: acked.current,
      read: read.current,
    });
  const request = useRef<KetikSessionTurnRequest | null>(
    initial.pendingTurn
      ? {
          requestId: initial.pendingTurn.requestId,
          text: initial.pendingTurn.text,
          expectedVersion: initial.pendingTurn.expectedVersion,
        }
      : null,
  );
  const busy = useRef(false);
  const blocked = useRef(Boolean(initial.pendingTurn));
  const delay = useRef<{
    timer: ReturnType<typeof setTimeout>;
    resolve: () => void;
  } | null>(null);
  const lastSendAt = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [typing, setTyping] = useState(false);
  const [messages, setMessages] = useState(() =>
    presentMessages(initial.messages, {
      open: initial.state === "active" && !initial.consumerClosed,
      queued: [],
      acked: new Set(),
      read: new Set(),
    }),
  );
  const [loading, setLoading] = useState(
    initial.pendingTurn?.status === "processing",
  );
  const [count, setCount] = useState(initial.pendingTurn ? 1 : 0);
  const [error, setError] = useState(
    initial.pendingTurn?.status === "failed"
      ? KETIK_SESSION_ERRORS.SESSION_AI_FAILED
      : "",
  );
  const expiresAt = Date.parse(initial.expiresAt);
  const [expired, setExpired] = useState(() => Date.now() >= expiresAt);
  const [closed, setClosed] = useState(
    initial.consumerClosed || initial.state !== "active",
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (delay.current) {
        clearTimeout(delay.current.timer);
        delay.current.resolve();
      }
    };
  }, []);
  // One timer at the deadline; a 1 s tick re-rendered the whole chat.
  useEffect(() => {
    if (expired) return;
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [expired, expiresAt]);
  const process = useCallback(async () => {
    if (busy.current || blocked.current || !mounted.current) return;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        delay.current = {
          timer: setTimeout(
            () => {
              delay.current = null;
              resolve();
            },
            Math.max(0, ms),
          ),
          resolve,
        };
      });
    const stopTyping = () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = null;
      if (mounted.current) setTyping(false);
    };
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      while (queue.current.length && mounted.current) {
        const session = current.current;
        if (
          session.state !== "active" ||
          session.consumerClosed ||
          Date.parse(session.expiresAt) <= Date.now()
        ) {
          setClosed(session.state !== "active" || session.consumerClosed);
          setError(
            "Chat sudah ditutup atau waktu sesi berakhir. Pesan antrean belum terkirim.",
          );
          break;
        }
        // Wait until the agent pauses so back-to-back messages are answered once.
        const mode = session.config.responsePacingMode;
        const quietUntil = lastSendAt.current + QUIET_WINDOW_MS[mode];
        if (!request.current && Date.now() < quietUntil) {
          await wait(quietUntil - Date.now());
          if (!mounted.current) return;
          continue;
        }
        const next = queue.current[0];
        request.current ??= {
          requestId: next.requestId,
          text: next.text,
          expectedVersion: session.version,
          ...(queue.current.length > 1 ? { awaitMore: true as const } : {}),
        };
        const active = request.current;
        // The consumer reads every agent message since its last reply, then types.
        const factor = consumerSpeedFactor(session.config.consumerType.id);
        const readEnd =
          lastSendAt.current +
          readingMs(
            [...pendingAgentTexts(session, active.requestId), active.text],
            mode,
          ) *
            factor;
        if (!active.awaitMore) {
          typingTimer.current = setTimeout(
            () => {
              if (!mounted.current) return;
              // Typing means the consumer has read everything up to this turn.
              setMessages((prev) => {
                const end = prev.findIndex((m) => m.id === active.requestId);
                for (const m of prev.slice(0, end + 1))
                  if (m.sender === "agent") read.current.add(m.id);
                return present(prev);
              });
              setTyping(true);
            },
            Math.max(0, readEnd - Date.now()),
          );
        }
        try {
          const result = await ketikApi.sendTurn(initial.id, active);
          if (!mounted.current) return;
          current.current = result;
          acked.current.add(active.requestId);
          const agentIndex = result.messages.findIndex(
            (m) => m.id === active.requestId,
          );
          setMessages(present(result.messages.slice(0, agentIndex + 1)));
          const ranges =
            mode === "training_fast" ? TRAINING_FAST_RANGES : REALISTIC_RANGES;
          const remaining = Math.max(
            0,
            (Date.parse(result.expiresAt) - Date.now()) / 1000,
          );
          const earlier = result.messages.slice(0, agentIndex);
          const consumerReplies = earlier.filter(
            (m) => m.sender === "consumer",
          ).length;
          let firstBand =
            consumerReplies === 0
              ? "greeting_reply"
              : classifyTextBand(
                  result.messages[agentIndex + 1]?.text.length ?? 0,
                );
          if (
            !active.awaitMore &&
            mode !== "training_fast" &&
            isSlowEligible({
              consumerTurnIndex: consumerReplies,
              consecutiveSlowCount: slow.current.consecutive,
              totalSlowCount: slow.current.total,
              sessionDurationMinutes: result.config.simulationDuration,
              remainingSeconds: remaining,
              elapsedSeconds:
                (Date.now() - Date.parse(result.startedAt)) / 1000,
              totalDurationSeconds: result.config.simulationDuration * 60,
            })
          ) {
            firstBand = "slow";
            slow.current.total++;
            slow.current.consecutive++;
          } else if (!active.awaitMore) {
            slow.current.consecutive = 0;
          }
          let showAt = readEnd;
          for (
            let index = agentIndex + 1;
            index < result.messages.length;
            index++
          ) {
            const first = index === agentIndex + 1;
            const range = ranges[first ? firstBand : "follow_up"];
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
            setMessages(present(result.messages.slice(0, index + 1)));
            showAt = Math.max(showAt, Date.now());
          }
          stopTyping();
          setMessages(present(result.messages));
          setClosed(result.consumerClosed || result.state !== "active");
          queue.current.shift();
          request.current = null;
          setCount(queue.current.length);
          if (result.consumerClosed || result.state !== "active") {
            if (queue.current.length)
              setError(
                "Konsumen sudah menutup chat. Pesan antrean belum terkirim.",
              );
            break;
          }
        } catch {
          stopTyping();
          if (mounted.current) {
            blocked.current = true;
            setError(KETIK_SESSION_ERRORS.SESSION_AI_FAILED);
          }
          break;
        }
      }
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [initial.id]);
  // A reload does not send a second provider request while the existing lease lives.
  useEffect(() => {
    if (!initial.pendingTurn || initial.pendingTurn.status !== "processing")
      return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const loaded = await ketikApi.getSession(initial.id);
        if (cancelled) return;
        current.current = loaded;
        setMessages(present(loaded.messages));
        if (!loaded.pendingTurn) {
          queue.current.shift();
          request.current = null;
          blocked.current = false;
          setCount(queue.current.length);
          setLoading(false);
          setClosed(loaded.consumerClosed || loaded.state !== "active");
          if (queue.current.length) {
            if (loaded.consumerClosed || loaded.state !== "active")
              setError("Chat sudah ditutup. Pesan antrean belum terkirim.");
            else void process();
          }
          return;
        }
        if (
          loaded.pendingTurn.status === "failed" ||
          !loaded.pendingTurn.leaseExpiresAt ||
          Date.parse(loaded.pendingTurn.leaseExpiresAt) <= Date.now()
        ) {
          setLoading(false);
          setError(KETIK_SESSION_ERRORS.SESSION_AI_FAILED);
          return;
        }
        timer = setTimeout(() => void poll(), 2000);
      } catch {
        if (!cancelled) {
          setLoading(false);
          setError("Status pesan belum bisa dimuat. Coba lagi.");
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [initial.id, initial.pendingTurn, process]);
  const send = (text: string) => {
    if (closed || expired || queue.current.length >= 20) {
      setError(
        expired
          ? KETIK_SESSION_ERRORS.SESSION_EXPIRED
          : "Antrean penuh atau chat sudah ditutup. Tunggu pesan sebelumnya.",
      );
      return false;
    }
    lastSendAt.current = Date.now();
    queue.current.push({
      requestId: crypto.randomUUID(),
      text,
      sentAt: new Date().toISOString(),
    });
    setCount(queue.current.length);
    // The bubble shows at once; only the server request waits for the quiet window.
    setMessages((prev) => present(prev));
    void process();
    return true;
  };
  const retry = () => {
    blocked.current = false;
    void process();
  };
  return {
    messages,
    isLoading: loading,
    isConsumerTyping: typing,
    queuedCount: count,
    error,
    retry,
    send,
    sessionPhase: closed
      ? ("closed" as const)
      : expired
        ? ("expired" as const)
        : ("active" as const),
  };
}
