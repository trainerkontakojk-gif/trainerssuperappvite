import type { PdktExpectedAnswerAlignment } from "@trainers/types";

interface Props {
  alignment: PdktExpectedAnswerAlignment;
}

export function ExpectedAnswerAlignmentCard({ alignment }: Props) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
      <h4 className="text-xs font-medium text-muted-foreground">
        Kesesuaian dengan Jawaban yang Diharapkan
      </h4>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {alignment.category}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {alignment.reason}
      </p>
    </div>
  );
}
