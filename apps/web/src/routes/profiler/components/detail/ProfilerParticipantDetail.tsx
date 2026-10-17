import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type {
  ProfilerFolder,
  ProfilerPeserta,
  ProfilerYear,
} from "@trainers/types";
import { labelJabatan } from "@trainers/types";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  FolderInput,
  GalleryHorizontal,
  Pencil,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

import { getPhotoFrame, getPhotoImageStyle } from "../../../../lib/photo-frame";
import { profilerApi } from "../../../../lib/profilerService";
import { notify } from "../../../../lib/toast";
import { getDaysUntilBirthday } from "../../utils/birthday";
import {
  formatTanggal,
  hitungMasaDinas,
  hitungUsia,
} from "../../utils/profilerFormatters";
import { MoveFolderModal } from "../table/MoveFolderModal";
import { ProfilerParticipantEditor } from "./ProfilerParticipantEditor";

const DEFAULT_TIMS = ["Telepon", "Chat", "Email"];

interface ProfilerParticipantDetailProps {
  batchName: string;
  peserta: ProfilerPeserta[];
  participant: ProfilerPeserta;
  editing: boolean;
  isReadOnly: boolean;
  folders: ProfilerFolder[];
  years: ProfilerYear[];
  /** `null` kembali ke daftar peserta. */
  onNavigate: (
    id: string | null,
    options?: { edit?: boolean; replace?: boolean },
  ) => void;
  onPesertaChange: (next: ProfilerPeserta[]) => void;
  onMoved: (ids: string[], targetFolder: string) => void;
}

/** Profil (lihat) dan edit peserta di area utama workspace. */
export default function ProfilerParticipantDetail({
  batchName,
  peserta,
  participant,
  editing,
  isReadOnly,
  folders,
  years,
  onNavigate,
  onPesertaChange,
  onMoved,
}: ProfilerParticipantDetailProps) {
  const navigate = useNavigate();
  const [timList, setTimList] = useState<string[]>(DEFAULT_TIMS);
  const [showMove, setShowMove] = useState(false);
  const index = peserta.findIndex((p) => p.id === participant.id);
  const previous = index > 0 ? peserta[index - 1] : null;
  const next = index < peserta.length - 1 ? peserta[index + 1] : null;
  const isEditing = editing && !isReadOnly;

  useEffect(() => {
    if (!isEditing) return;
    profilerApi
      .getTeams()
      .then((teams) => {
        if (teams.length > 0) setTimList(teams.map((team) => team.nama));
      })
      .catch((error) => console.error("Gagal memuat tim", error));
  }, [isEditing]);

  const replaceParticipant = (updated: ProfilerPeserta) =>
    onPesertaChange(
      peserta.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
    );

  return (
    <section
      aria-label={`Profil ${participant.nama || "peserta"}`}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8"
    >
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/profiler"
          search={{ batch: batchName }}
          className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Kembali ke {batchName}
        </Link>
        {!isEditing && peserta.length > 1 ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground tabular-nums">
              {index + 1} dari {peserta.length}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              className="size-11"
              aria-label="Peserta sebelumnya"
              disabled={!previous}
              onClick={() => previous?.id && onNavigate(previous.id)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              className="size-11"
              aria-label="Peserta berikutnya"
              disabled={!next}
              onClick={() => next?.id && onNavigate(next.id)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </div>

      {isEditing ? (
        <ProfilerParticipantEditor
          key={participant.id}
          peserta={participant}
          timList={timList}
          isReadOnly={isReadOnly}
          onClose={() =>
            onNavigate(participant.id ?? null, { replace: true })
          }
          onSaved={replaceParticipant}
          onDeleted={(id) => {
            onPesertaChange(peserta.filter((p) => p.id !== id));
            onNavigate(null, { replace: true });
          }}
          onFrameUpdated={(id, frame) =>
            replaceParticipant({
              ...(peserta.find((p) => p.id === id) ?? participant),
              photo_frame: frame,
            })
          }
          onPhotoUpdated={(id, fotoUrl) =>
            replaceParticipant({
              ...(peserta.find((p) => p.id === id) ?? participant),
              foto_url: fotoUrl,
            })
          }
        />
      ) : (
        <>
          <header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar className="!size-20 shrink-0 overflow-hidden rounded-xl">
                {participant.foto_url ? (
                  <AvatarImage
                    src={participant.foto_url}
                    alt=""
                    style={getPhotoImageStyle(
                      getPhotoFrame(participant.id, participant.photo_frame),
                    )}
                    referrerPolicy="no-referrer"
                  />
                ) : null}
                <AvatarFallback className="rounded-xl text-2xl">
                  {participant.nama?.charAt(0)?.toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground tabular-nums">
                  {batchName} · No. {String(index + 1).padStart(2, "0")}
                </p>
                <h1 className="break-words font-outfit text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {participant.nama || "Tanpa nama"}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {summaryLine(participant)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="min-h-11"
                onClick={() =>
                  navigate({
                    to: "/profiler",
                    search: {
                      batch: batchName,
                      view: "slide",
                      participant: participant.id,
                    },
                  })
                }
              >
                <GalleryHorizontal
                  data-icon="inline-start"
                  aria-hidden="true"
                />
                Slide
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="min-h-11"
                onClick={() =>
                  participant.id &&
                  navigate({
                    to: "/sidak/agents/$id",
                    params: { id: participant.id },
                  })
                }
              >
                <Activity data-icon="inline-start" aria-hidden="true" />
                Analisis QA
              </Button>
              {!isReadOnly ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="min-h-11"
                    onClick={() => setShowMove(true)}
                  >
                    <FolderInput data-icon="inline-start" aria-hidden="true" />
                    Pindah folder
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    className="min-h-11"
                    onClick={() =>
                      participant.id &&
                      onNavigate(participant.id, { edit: true })
                    }
                  >
                    <Pencil data-icon="inline-start" aria-hidden="true" />
                    Edit
                  </Button>
                </>
              ) : null}
            </div>
          </header>

          <ProfileFields p={participant} />
        </>
      )}

      {showMove && participant.id ? (
        <MoveFolderModal
          selectedIds={[participant.id]}
          currentBatch={batchName}
          folders={folders}
          years={years}
          onClose={() => setShowMove(false)}
          onMoved={(ids, target) => {
            onMoved(ids, target);
            onNavigate(null);
            notify.success(`${participant.nama} dipindahkan ke ${target}`);
          }}
        />
      ) : null}
    </section>
  );
}

function summaryLine(p: ProfilerPeserta) {
  const parts = [
    p.jabatan ? labelJabatan[p.jabatan] || p.jabatan : null,
    p.tim,
    p.bergabung_date ? `Masa dinas ${hitungMasaDinas(p.bergabung_date)}` : null,
    p.tgl_lahir ? `${hitungUsia(p.tgl_lahir)} tahun` : null,
  ];
  if (p.tgl_lahir) {
    const days = getDaysUntilBirthday(p.tgl_lahir);
    if (days === 0) parts.push("ulang tahun hari ini");
    else if (days <= 7) parts.push(`ulang tahun ${days} hari lagi`);
  }
  return parts.filter(Boolean).join(" · ");
}

type FieldRow = [label: string, value: string | null | undefined];

function ProfileFields({ p }: { p: ProfilerPeserta }) {
  const date = (value?: string | null) => (value ? formatTanggal(value) : null);
  const groups: { title: string; rows: FieldRow[] }[][] = [
    [
      {
        title: "Data pekerjaan",
        rows: [
          ["NIK OJK", p.nik_ojk],
          ["Email OJK", p.email_ojk],
          ["No. telepon", p.no_telepon],
          ["Bergabung di 157", date(p.bergabung_date)],
          ["Telepon darurat", p.no_telepon_darurat],
          ["Nama kontak darurat", p.nama_kontak_darurat],
          ["Hubungan", p.hubungan_kontak_darurat],
        ],
      },
      {
        title: "Data pribadi",
        rows: [
          ["Jenis kelamin", p.jenis_kelamin],
          ["Agama", p.agama],
          ["Tanggal lahir", date(p.tgl_lahir)],
          ["Status perkawinan", p.status_perkawinan],
        ],
      },
    ],
    [
      {
        title: "Latar belakang",
        rows: [
          ["Pendidikan", p.pendidikan],
          ["Lembaga", p.nama_lembaga],
          ["Jurusan", p.jurusan],
          ["Perusahaan sebelumnya", p.previous_company],
          ["Pengalaman contact center", p.pengalaman_cc],
        ],
      },
      {
        title: "Data sensitif",
        rows: [
          ["No. KTP", p.no_ktp],
          ["No. NPWP", p.no_npwp],
          ["No. rekening", p.nomor_rekening],
          ["Nama bank", p.nama_bank],
          ["Status hunian", p.status_tempat_tinggal],
          ["Alamat tinggal", p.alamat_tinggal],
        ],
      },
      {
        title: "Catatan",
        rows: [
          ["Catatan tambahan", p.catatan_tambahan],
          ["Keterangan admin", p.keterangan],
        ],
      },
    ],
  ];

  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
      {groups.map((column, columnIndex) => (
        <div key={columnIndex} className="flex flex-col gap-8">
          {column.map((group) => (
            <section key={group.title}>
              <h2 className="border-b border-border pb-2 text-sm font-semibold text-foreground">
                {group.title}
              </h2>
              <dl>
                {group.rows.map(([label, value]) => (
                  <div
                    key={label}
                    className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-4 border-b border-border py-2.5 text-sm"
                  >
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="break-words text-foreground">
                      {value || "-"}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      ))}
    </div>
  );
}
