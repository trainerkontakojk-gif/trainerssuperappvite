import React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface SettingsFieldProps {
  label: string;
  id?: string;
  helperText?: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

export function SettingsField({
  label,
  id,
  helperText,
  required,
  optional: _optional,
  error,
  className = "",
  children,
}: SettingsFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}{" "}
        {required ? (
          <span aria-hidden="true" className="font-normal text-foreground/70">
            Wajib
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="font-normal text-muted-foreground/70"
          >
            Opsional
          </span>
        )}
      </Label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {helperText && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {helperText}
        </p>
      )}
    </div>
  );
}

interface SettingsInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export function SettingsInput({
  className = "",
  ...props
}: SettingsInputProps) {
  return (
    <Input
      className={cn(
        "min-h-11 w-full rounded-lg bg-background text-sm",
        className,
      )}
      {...props}
    />
  );
}

interface SettingsSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  className?: string;
}

interface SettingsTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string;
}

export function SettingsTextarea({
  className = "",
  ...props
}: SettingsTextareaProps) {
  return (
    <Textarea
      className={cn(
        "min-h-24 resize-y rounded-lg bg-background text-sm",
        className,
      )}
      {...props}
    />
  );
}

export function SettingsSelect({
  className = "",
  children,
  ...props
}: SettingsSelectProps) {
  return (
    <div className="relative">
      <select
        className={cn(
          "min-h-11 w-full appearance-none rounded-lg border border-input bg-background px-3 pr-9 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

interface SettingsCardOptionProps {
  isSelected: boolean;
  onClick: () => void;
  title: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function SettingsCardOption({
  isSelected,
  onClick,
  title,
  badge,
  actions,
  children,
  className = "",
}: SettingsCardOptionProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 transition-colors",
        isSelected
          ? "border-primary/50 bg-primary/5"
          : "border-border bg-card hover:border-foreground/20",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-sm font-semibold tracking-tight text-foreground">
              {title}
            </h4>
            {badge}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {children}
          </p>
        </div>
        <Button
          type="button"
          variant={isSelected ? "secondary" : "outline"}
          aria-pressed={isSelected}
          onClick={onClick}
          className="shrink-0"
        >
          {isSelected && <Check data-icon="inline-start" />}
          {isSelected ? "Dipakai" : "Pilih"}
        </Button>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-border pt-3">
          {actions}
        </div>
      )}
    </div>
  );
}
