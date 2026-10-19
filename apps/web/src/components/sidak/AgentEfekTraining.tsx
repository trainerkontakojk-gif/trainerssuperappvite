import { Link } from "@tanstack/react-router";
import type { EfekTrainingEntry } from "@trainers/types";
import { monthShort } from "../../routes/tna/efek-report-format";

/**
 * "Ikut pelatihan" lines on the SIDAK agent sidebar. The quickview only sends
 * `efekTraining` to roles with `tna.read`, so nothing renders for others.
 */
export default function AgentEfekTraining({
  entries,
}: {
  entries?: EfekTrainingEntry[];
}) {
  if (!entries?.length) return null;
  return (
    <section aria-labelledby="agent-efek-training" className="py-2.5">
      <h2 id="agent-efek-training" className="text-sm font-normal text-fg2">
        Ikut pelatihan
      </h2>
      <ul className="mt-1 space-y-0.5">
        {entries.map((t) => (
          <li key={t.sessionId}>
            <Link
              to="/tna/efek/program/$code"
              params={{ code: t.programCode }}
              search={{ session: t.sessionId }}
              className="inline-flex min-h-[44px] flex-col justify-center text-sm underline-offset-4 hover:underline"
            >
              <span className="font-medium">
                {t.programName} ·{" "}
                {monthShort({
                  year: Number(t.startDate.slice(0, 4)),
                  month: Number(t.startDate.slice(5, 7)),
                })}
              </span>
              <span className="text-xs text-muted-foreground">{t.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
