import { useCallback, useEffect, useRef, useState } from "react";
import type {
  KetikServerSession,
  KetikSessionTurnRequest,
} from "@trainers/types";
import { KETIK_SESSION_ERRORS } from "@trainers/types";
import { ketikApi } from "../ketikApi";
import {
  boundedRandom,
  classifyTextBand,
  isAgentGivingSolution,
  isSlowEligible,
  REALISTIC_RANGES,
  TRAINING_FAST_RANGES,
} from "../lib/pacing";

/** One ordered queue; typing/send stays available while a turn is in flight. */
export function useServerKetikChat(initial: KetikServerSession) {
  const current = useRef(initial);
  const slow = useRef({ total: 0, consecutive: 0 });
  const mounted = useRef(true);
  const queue = useRef<Array<{ requestId: string; text: string }>>(
    initial.pendingTurn
      ? [
          {
            requestId: initial.pendingTurn.requestId,
            text: initial.pendingTurn.text,
          },
        ]
      : [],
  );
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
  const [messages, setMessages] = useState(initial.messages);
  const [loading, setLoading] = useState(
    initial.pendingTurn?.status === "processing",
  );
  const [count, setCount] = useState(initial.pendingTurn ? 1 : 0);
  const [error, setError] = useState(
    initial.pendingTurn?.status === "failed"
      ? KETIK_SESSION_ERRORS.SESSION_AI_FAILED
      : "",
  );
  const [now, setNow] = useState(() => Date.now());
  const [closed, setClosed] = useState(
    initial.consumerClosed || initial.state !== "active",
  );
  useEffect(() => {
    mounted.current = true;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false;
      clearInterval(tick);
      if (delay.current) {
        clearTimeout(delay.current.timer);
        delay.current.resolve();
      }
    };
  }, []);
  const expired = now >= Date.parse(initial.expiresAt);
  const process = useCallback(async () => {
    if (busy.current || blocked.current || !mounted.current) return;
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
        const next = queue.current[0];
        request.current ??= {
          ...next,
          expectedVersion: current.current.version,
        };
        const active = request.current;
        setMessages((prev) =>
          prev.some((m) => m.id === active.requestId)
            ? prev
            : [
                ...prev,
                {
                  id: active.requestId,
                  sender: "agent",
                  text: active.text,
                  timestamp: new Date().toISOString(),
                },
              ],
        );
        try {
          const result = await ketikApi.sendTurn(initial.id, active);
          if (!mounted.current) return;
          current.current = result;
          const agentIndex = result.messages.findIndex(
            (m) => m.id === active.requestId,
          );
          setMessages(result.messages.slice(0, agentIndex + 1));
          const ranges =
            result.config.responsePacingMode === "training_fast"
              ? TRAINING_FAST_RANGES
              : REALISTIC_RANGES;
          const solution = isAgentGivingSolution(active.text);
          const remaining = Math.max(
            0,
            (Date.parse(result.expiresAt) - Date.now()) / 1000,
          );
          let firstBand =
            result.version === 2
              ? "greeting_reply"
              : classifyTextBand(
                  result.messages[agentIndex + 1]?.text.length ?? 0,
                );
          if (
            result.config.responsePacingMode !== "training_fast" &&
            !solution &&
            isSlowEligible({
              consumerTurnIndex: Math.floor(result.version / 2),
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
          } else {
            slow.current.consecutive = 0;
          }
          for (
            let index = agentIndex + 1;
            index < result.messages.length;
            index++
          ) {
            const first = index === agentIndex + 1;
            const range = ranges[first ? firstBand : "follow_up"];
            let planned = boundedRandom(range.minMs, range.maxMs);
            if (remaining < 20) planned = boundedRandom(1000, 3000);
            else if (first && solution && planned < 10000)
              planned = boundedRandom(10000, Math.max(10000, range.maxMs));
            else if (planned > remaining * 1000 - 5000)
              planned = boundedRandom(
                1000,
                Math.max(1000, remaining * 1000 - 5000),
              );
            const wait = Math.max(
              0,
              Math.min(planned, Date.parse(result.expiresAt) - Date.now()),
            );
            await new Promise<void>((resolve) => {
              delay.current = { timer: setTimeout(resolve, wait), resolve };
            });
            delay.current = null;
            if (!mounted.current) return;
            setMessages(result.messages.slice(0, index + 1));
          }
          setMessages(result.messages);
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
        setMessages(loaded.messages);
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
    queue.current.push({ requestId: crypto.randomUUID(), text });
    setCount(queue.current.length);
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
