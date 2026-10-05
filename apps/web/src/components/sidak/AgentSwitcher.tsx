import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type {
  AgentDirectoryEntry,
  AgentDirectoryResponse,
} from "@trainers/types";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { useApi } from "../../hooks/useApi";

interface Props {
  currentAgentId: string;
  year: number;
  onAgentChange: (id: string) => void;
}

function normalize(value: string): string {
  return value.toLocaleLowerCase("id-ID").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Satu pemilih agen dengan pencarian nama, tim, atau batch.
 *
 * Daftar diambil dari direktori agen (`GET /sidak/agents`) yang sudah
 * dibatasi role/akses di backend, dan baru dimuat saat pemilih dibuka.
 */
export default function AgentSwitcher({
  currentAgentId,
  year,
  onAgentChange,
}: Props) {
  const [requested, setRequested] = useState(false);
  const { data, loading, error } = useApi<AgentDirectoryResponse>(
    requested ? `/sidak/agents?year=${year}&show_all=true` : null,
  );

  const agents = useMemo<AgentDirectoryEntry[]>(
    () =>
      [...(data?.agents ?? [])]
        .filter((agent) => agent.id !== currentAgentId)
        .sort((a, b) => a.nama.localeCompare(b.nama, "id-ID")),
    [data?.agents, currentAgentId],
  );

  const emptyText = error
    ? "Daftar agen belum dapat dimuat. Coba buka lagi."
    : loading || !data
      ? "Memuat daftar agen…"
      : "Tidak ada agen yang cocok.";

  return (
    <Combobox
      items={agents}
      value={null as AgentDirectoryEntry | null}
      autoHighlight
      onOpenChange={(open) => {
        if (open) setRequested(true);
      }}
      itemToStringLabel={(agent: AgentDirectoryEntry | null) =>
        agent?.nama ?? ""
      }
      itemToStringValue={(agent: AgentDirectoryEntry | null) => agent?.id ?? ""}
      filter={(agent: AgentDirectoryEntry, query: string) =>
        normalize(
          `${agent.nama} ${agent.tim} ${agent.batch_name ?? agent.batch}`,
        ).includes(normalize(query))
      }
      onValueChange={(agent: AgentDirectoryEntry | null) => {
        if (agent) onAgentChange(agent.id);
      }}
    >
      <ComboboxTrigger
        aria-label="Ganti agen"
        render={
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full justify-between px-3 font-normal text-muted-foreground"
          />
        }
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Ganti agen…</span>
        </span>
      </ComboboxTrigger>
      <ComboboxContent
        align="start"
        className="group/combobox-content min-w-[min(22rem,calc(100vw-2rem))]"
      >
        <div className="border-b border-border p-1">
          <ComboboxInput
            aria-label="Cari agen"
            placeholder="Cari nama, tim, atau batch…"
          />
        </div>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(agent: AgentDirectoryEntry) => (
            <ComboboxItem key={agent.id} value={agent}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{agent.nama}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {agent.tim} · {agent.batch_name ?? agent.batch}
                </span>
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
