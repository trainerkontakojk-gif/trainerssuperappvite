import React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";

export interface ExportOption {
  id: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  action: () => void;
  hover: string;
}

interface ProfilerExportCardProps {
  option: ExportOption;
  disabled: boolean;
  isGenerating: boolean;
}

export function ProfilerExportCard({
  option,
  disabled,
  isGenerating,
}: ProfilerExportCardProps) {
  return (
    <Card className="flex h-full shadow-none">
      <CardHeader className="flex flex-row items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
          {isGenerating ? (
            <Loader2
              className="size-5 animate-spin text-primary"
              aria-label="Menyiapkan ekspor"
            />
          ) : (
            option.icon
          )}
        </div>
        <CardTitle className="min-w-0 break-words text-base">
          {option.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <p className="flex-1 text-sm leading-6 text-muted-foreground">
          {option.desc}
        </p>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="min-h-11 w-full"
          onClick={option.action}
          disabled={disabled}
        >
          {isGenerating ? "Menyiapkan..." : "Unduh"}
        </Button>
      </CardContent>
    </Card>
  );
}
