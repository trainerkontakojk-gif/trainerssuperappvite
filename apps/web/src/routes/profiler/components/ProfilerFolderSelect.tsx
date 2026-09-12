import { Fragment } from "react";
import type { ProfilerFolder, ProfilerYear } from "@trainers/types";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";

interface ProfilerFolderSelectProps {
  years: ProfilerYear[];
  folders: ProfilerFolder[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  hideLabel?: boolean;
  disabled?: boolean;
  className?: string;
}

export function ProfilerFolderSelect({
  years,
  folders,
  value,
  onChange,
  label = "Batch aktif",
  hideLabel = false,
  disabled,
  className,
}: ProfilerFolderSelectProps) {
  return (
    <div className={className}>
      {hideLabel ? null : (
        <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
      )}
      <Select
        value={value || null}
        onValueChange={(nextValue) => {
          if (nextValue) onChange(nextValue);
        }}
        disabled={disabled}
      >
        <SelectTrigger
          className="h-11 w-full min-w-0 bg-background"
          aria-label={label}
        >
          <SelectValue placeholder="Pilih folder" />
        </SelectTrigger>
        <SelectContent align="start">
          {years.length === 0 ? (
            <SelectGroup>
              <SelectItem value="__empty__" disabled>
                Belum ada folder
              </SelectItem>
            </SelectGroup>
          ) : (
            years.map((year) => {
              const rootFolders = folders.filter(
                (folder) => folder.year_id === year.id && !folder.parent_id,
              );
              if (rootFolders.length === 0) return null;

              return (
                <SelectGroup key={year.id}>
                  <SelectLabel>{year.label}</SelectLabel>
                  {rootFolders.map((folder) => {
                    const subFolders = folders.filter(
                      (subFolder) => subFolder.parent_id === folder.id,
                    );
                    return (
                      <Fragment key={folder.id}>
                        <SelectItem value={folder.name}>
                          {folder.name}
                        </SelectItem>
                        {subFolders.map((subFolder) => (
                          <SelectItem
                            key={subFolder.id}
                            value={subFolder.name}
                            className="pl-6"
                          >
                            {subFolder.name}
                          </SelectItem>
                        ))}
                      </Fragment>
                    );
                  })}
                </SelectGroup>
              );
            })
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
