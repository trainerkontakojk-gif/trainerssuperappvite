import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  EFEK_MAX_IMPORT_SESSIONS,
  EFEK_MAX_MATCH_NAMES,
  EFEK_MAX_PARTICIPANTS,
  type EfekNameMatch,
  type EfekProgram,
  type EfekSessionInput,
} from "@trainers/types";
import { useApi } from "../../hooks/useApi";
import { rpcClient } from "../../lib/api/rpc-client";
import { unwrapResponse } from "../../lib/api/unwrap-response";
import {
  parseCsv,
  readWorkbookRaw,
  readWorkbookRawValues,
  toDateOnlyUTC,
  writeFlatExcel,
} from "../../lib/excel-utils";
import QaStatePanel from "../../components/ui/QaStatePanel";
import { Button } from "../../components/ui/button";
import { SERVICE_LABELS } from "../../lib/scoring";
import { Surface, State, MutationState } from "./shared";
import { TnaTabs } from "./TnaTabs";
import { selectClass, sessionDates, useTnaMutation } from "./utils";
import {
  EFEK_TEMPLATE_HEADERS,
  efekSessionKey,
  parseEfekSheets,
  type EfekImportProblem,
  type EfekImportRow,
} from "./efek-import-parse";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

async function readSheets(file: File): Promise<Record<string, string[][]>> {
  if (/\.csv$/i.test(file.name))
    return { [file.name.replace(/\.csv$/i, "")]: parseCsv(await file.text()) };
  const buffer = await file.arrayBuffer();
  const [text, values] = await Promise.all([
    readWorkbookRaw(buffer),
    readWorkbookRawValues(buffer),
  ]);
  // Excel dates use UTC getters so a session never shifts by a day.
  for (const name of text.names)
    text.sheets[name] = text.sheets[name]!.map((row, r) =>
      row.map(
        (cell, c) => toDateOnlyUTC(values.sheets[name]?.[r]?.[c]) ?? cell,
      ),
    );
  return text.sheets;
}

export default function EfekImportPage() {
  const navigate = useNavigate();
  const programs = useApi<EfekProgram[]>("/tna/efek/programs");
  const mutation = useTnaMutation();
  const [fileName, setFileName] = useState("");
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [rows, setRows] = useState<EfekImportRow[]>([]);
  const [problems, setProblems] = useState<EfekImportProblem[]>([]);
  const [matches, setMatches] = useState<Record<string, EfekNameMatch>>({});
  const [chosen, setChosen] = useState<Record<string, string>>({});

  async function onFile(file: File | undefined) {
    if (!file || !programs.data) return;
    setReadError(null);
    setRows([]);
    setProblems([]);
    setMatches({});
    setChosen({});
    setFileName(file.name);
    if (file.size > MAX_FILE_BYTES) {
      setReadError("File terlalu besar. Maksimal 5 MB.");
      return;
    }
    setReading(true);
    try {
      const parsed = parseEfekSheets(await readSheets(file), programs.data);
      const names = [...new Set(parsed.rows.map((r) => r.name))];
      if (names.length > EFEK_MAX_MATCH_NAMES)
        throw new Error(
          `Maksimal ${EFEK_MAX_MATCH_NAMES} nama per impor. Pecah file menjadi beberapa bagian.`,
        );
      setRows(parsed.rows);
      setProblems(parsed.problems);
      if (names.length === 0) return;
      const result = await unwrapResponse(
        await rpcClient.v1.tna.efek.import.match.$post({ json: { names } }),
      );
      const byName: Record<string, EfekNameMatch> = {};
      const picks: Record<string, string> = {};
      for (const item of result.items) {
        byName[item.name] = item;
        if (item.status === "cocok") picks[item.name] = item.candidates[0]!.id;
      }
      setMatches(byName);
      setChosen(picks);
    } catch (e) {
      setReadError(
        e instanceof Error && e.message
          ? e.message
          : "File tidak bisa dibaca. Pastikan formatnya .xlsx atau .csv.",
      );
    } finally {
      setReading(false);
    }
  }

  const sessions = useMemo(() => {
    const grouped = new Map<string, EfekSessionInput>();
    for (const row of rows) {
      const id = chosen[row.name];
      if (!id) continue;
      const key = efekSessionKey(row);
      const program = programs.data?.find((p) => p.code === row.program_code);
      const session = grouped.get(key) ?? {
        program_code: row.program_code,
        title: row.title,
        service_type: program?.default_service_type ?? "call",
        start_date: row.start_date,
        end_date: row.end_date,
        peserta_ids: [],
      };
      if (row.end_date > session.end_date) session.end_date = row.end_date;
      if (!session.peserta_ids.includes(id)) session.peserta_ids.push(id);
      grouped.set(key, session);
    }
    return [...grouped.values()];
  }, [rows, chosen, programs.data]);

  const statusCount = (status: EfekNameMatch["status"]) =>
    new Set(
      rows.filter((r) => matches[r.name]?.status === status).map((r) => r.name),
    ).size;
  const unresolved = new Set(
    rows
      .filter((r) => matches[r.name]?.status === "pilih" && !chosen[r.name])
      .map((r) => r.name),
  ).size;
  const participantTotal = sessions.reduce(
    (n, s) => n + s.peserta_ids.length,
    0,
  );
  const tooBig =
    sessions.length > EFEK_MAX_IMPORT_SESSIONS ||
    sessions.some((s) => s.peserta_ids.length > EFEK_MAX_PARTICIPANTS);
  const programName = (code: string) =>
    programs.data?.find((p) => p.code === code)?.name ?? code;

  return (
    <Surface
      title="Impor peserta pelatihan"
      description="Unggah daftar peserta dari Excel atau CSV. Nama dicocokkan ke Profiler; nama yang tidak ditemukan dilewati dan tidak dibuat otomatis."
    >
      <TnaTabs current="efek" />
      <Link
        to="/tna/efek"
        className="inline-flex min-h-[44px] items-center text-sm underline underline-offset-4"
      >
        Kembali ke EFEK
      </Link>
      <State
        loading={programs.loading}
        error={programs.error}
        retry={programs.refetch}
      />
      {programs.data && (
        <section className="space-y-3" aria-label="Pilih file">
          <p className="max-w-[70ch] text-sm text-muted-foreground">
            Kolom yang dibaca: {EFEK_TEMPLATE_HEADERS.join(", ")}. Kolom Program
            boleh kosong bila setiap tab diberi nama program (KETIK, PDKT,
            TELEFUN, CERIWIS). Tanggal boleh berupa bulan saja, misalnya "Mei
            2026". Tanpa Nama Sesi, sesi dinamai menurut bulannya.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-md border border-foreground bg-foreground px-4 text-sm font-medium text-background focus-within:outline-2 focus-within:outline-foreground">
              Pilih file
              <input
                type="file"
                accept=".xlsx,.csv"
                aria-label="File daftar peserta"
                className="sr-only"
                onChange={(e) => {
                  void onFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              onClick={() =>
                void writeFlatExcel(
                  "Peserta",
                  [
                    {
                      Program: "KETIK",
                      "Nama Sesi": "Level Up Week Mei",
                      "Tanggal Mulai": "2026-05-12",
                      "Tanggal Selesai": "2026-05-16",
                      "Nama Peserta": "Nama sesuai Profiler",
                    },
                  ],
                  "template-peserta-efek.xlsx",
                )
              }
            >
              Unduh template
            </Button>
            {fileName && (
              <span className="text-sm text-muted-foreground">{fileName}</span>
            )}
          </div>
        </section>
      )}
      {reading && <QaStatePanel type="loading" title="Membaca file…" />}
      {readError && <QaStatePanel type="error" title={readError} />}
      {problems.length > 0 && (
        <QaStatePanel
          type="warning"
          className="text-foreground!"
          title={`${problems.length} baris tidak bisa dibaca dan dilewati`}
          description={problems
            .slice(0, 5)
            .map((p) => `${p.sheet} baris ${p.line}: ${p.message}`)
            .join(" ")}
        />
      )}
      {rows.length > 0 && Object.keys(matches).length > 0 && (
        <section className="space-y-4" aria-label="Hasil pencocokan">
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-muted px-3 py-1">
              {statusCount("cocok")} cocok
            </span>
            <span className="rounded-full bg-muted px-3 py-1">
              {statusCount("pilih")} perlu dipilih
            </span>
            <span className="rounded-full bg-muted px-3 py-1">
              {statusCount("tidak_ditemukan")} tidak ditemukan
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Nama di file</th>
                  <th className="px-3 py-2 font-semibold">Program</th>
                  <th className="px-3 py-2 font-semibold">Sesi</th>
                  <th className="px-3 py-2 font-semibold">Cocok di Profiler</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const match = matches[row.name];
                  return (
                    <tr
                      key={`${row.sheet}-${row.line}`}
                      className="border-t border-border"
                    >
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2">
                        {programName(row.program_code)}
                      </td>
                      <td className="px-3 py-2">
                        {row.title}
                        <span className="block text-xs text-muted-foreground">
                          {sessionDates(row)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {match?.status === "cocok" && (
                          <span>
                            {match.candidates[0]!.nama}
                            {match.candidates[0]!.tim &&
                              ` · ${match.candidates[0]!.tim}`}
                          </span>
                        )}
                        {match?.status === "pilih" && (
                          <select
                            aria-label={`Pilih peserta untuk ${row.name}`}
                            className={selectClass}
                            value={chosen[row.name] ?? ""}
                            onChange={(e) =>
                              setChosen({
                                ...chosen,
                                [row.name]: e.target.value,
                              })
                            }
                          >
                            <option value="">Lewati nama ini</option>
                            {match.candidates.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nama}
                                {c.tim ? ` · ${c.tim}` : ""}
                              </option>
                            ))}
                          </select>
                        )}
                        {match?.status === "tidak_ditemukan" && (
                          <span className="text-muted-foreground">
                            Tidak ada di Profiler · dilewati
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sessions.length > 0 && (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {sessions.map((s) => (
                <li key={efekSessionKey(s)}>
                  {programName(s.program_code)} · {s.title} ·{" "}
                  {SERVICE_LABELS[s.service_type]} · {s.peserta_ids.length}{" "}
                  peserta
                </li>
              ))}
            </ul>
          )}
          {unresolved > 0 && (
            <p className="text-sm text-muted-foreground">
              {unresolved} nama belum dipilih dan akan dilewati.
            </p>
          )}
          {tooBig && (
            <p role="alert" className="text-sm text-destructive">
              Satu impor maksimal {EFEK_MAX_IMPORT_SESSIONS} sesi dan{" "}
              {EFEK_MAX_PARTICIPANTS} peserta per sesi.
            </p>
          )}
          <MutationState mutation={mutation} reload={() => location.reload()} />
          <Button
            className="min-h-[44px]"
            disabled={mutation.busy || sessions.length === 0 || tooBig}
            onClick={() =>
              mutation.run(async () => {
                await unwrapResponse(
                  await rpcClient.v1.tna.efek.import.$post({
                    json: { sessions },
                  }),
                );
                await navigate({ to: "/tna/efek" });
              }, "Peserta diimpor")
            }
          >
            {mutation.busy
              ? "Mengimpor…"
              : `Impor ${participantTotal} peserta ke ${sessions.length} sesi`}
          </Button>
        </section>
      )}
      {rows.length === 0 && fileName && !reading && !readError && (
        <QaStatePanel
          type="empty"
          title="Tidak ada baris peserta yang terbaca"
          description="Periksa nama kolom atau unduh template."
        />
      )}
    </Surface>
  );
}
