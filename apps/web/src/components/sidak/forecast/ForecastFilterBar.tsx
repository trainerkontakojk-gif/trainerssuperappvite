import type { ComponentProps } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DashboardFilters from "../DashboardFilters";
import { MONTH_OPTIONS } from "../../../utils/forecastFormat";

type FilterProps = Omit<ComponentProps<typeof DashboardFilters>, "showHeader">;

/** Bar filter satu blok: filter dashboard + periode proyeksi dalam satu baris. */
export default function ForecastFilterBar({
  horizon,
  onHorizonChange,
  ...filters
}: FilterProps & {
  horizon: number;
  onHorizonChange: (months: number) => void;
}) {
  return (
    <div
      data-testid="forecast-filter-bar"
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <div className="min-w-0 sm:flex-1">
        <DashboardFilters {...filters} showHeader={false} />
      </div>
      <div className="flex w-full flex-col gap-1.5 sm:w-40">
        <Label
          htmlFor="sidak-forecast-horizon"
          className="text-[12px] font-semibold text-muted-foreground"
        >
          Periode proyeksi
        </Label>
        <Select
          items={MONTH_OPTIONS.map((month) => ({
            value: String(month),
            label: `${month} bulan`,
          }))}
          value={String(horizon)}
          onValueChange={(value) => {
            if (value !== null) onHorizonChange(Number(value));
          }}
        >
          <SelectTrigger
            id="sidak-forecast-horizon"
            aria-label="Periode proyeksi"
            className="min-h-[44px] w-full rounded-lg border-border bg-background text-sm font-medium hover:bg-muted focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <SelectValue placeholder="Pilih periode" />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectGroup>
              {MONTH_OPTIONS.map((month) => (
                <SelectItem key={month} value={String(month)}>
                  {month} bulan
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
