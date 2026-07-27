import React from "react";

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
    <div className={`space-y-1.5 ${className}`}>
      <label
        htmlFor={id}
        className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5"
      >
        {label}{" "}
        {required ? (
          <span className="ml-1 text-xs font-semibold text-foreground">
            Wajib
          </span>
        ) : (
          <span className="ml-1 text-xs text-muted-foreground">Opsional</span>
        )}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {helperText && (
        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
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
    <input
      className={`w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors placeholder:text-muted-foreground/30 ${className}`}
      {...props}
    />
  );
}

interface SettingsSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  className?: string;
}

export function SettingsSelect({
  className = "",
  children,
  ...props
}: SettingsSelectProps) {
  return (
    <div className="relative group">
      <select
        className={`w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground outline-none transition-colors appearance-none cursor-pointer ${className}`}
        {...props}
      >
        {children}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M1 1L5 5L9 1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
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
      onClick={onClick}
      className={`group cursor-pointer p-4 rounded-xl border transition-colors flex flex-col justify-between ${
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border bg-card/45 hover:bg-foreground/[0.02]"
      } ${className}`}
    >
      <div className="flex justify-between items-start mb-2 gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <h4 className="font-semibold text-foreground tracking-tight text-sm truncate">
            {title}
          </h4>
          {badge && <div className="flex gap-2 flex-wrap mt-0.5">{badge}</div>}
        </div>
        <div className="flex items-center shrink-0 gap-2">
          {isSelected ? (
            <div className="w-4 h-4 rounded-full border border-primary flex items-center justify-center shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-primary" />
            </div>
          ) : (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {actions}
            </div>
          )}
        </div>
      </div>
      <div className="text-sm text-muted-foreground leading-relaxed mt-1.5">
        {children}
      </div>
    </div>
  );
}
