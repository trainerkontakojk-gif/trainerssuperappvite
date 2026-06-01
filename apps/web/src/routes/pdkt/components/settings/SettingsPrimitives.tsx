import React from "react";
import { Check } from "lucide-react";

interface SettingsFieldProps {
  label: string;
  id?: string;
  helperText?: string;
  className?: string;
  children: React.ReactNode;
}

export function SettingsField({ label, id, helperText, className = "", children }: SettingsFieldProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
        {label}
      </label>
      {children}
      {helperText && (
        <p className="mt-1 ml-1 text-[10px] text-muted-foreground font-medium leading-relaxed">
          {helperText}
        </p>
      )}
    </div>
  );
}

interface SettingsInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export function SettingsInput({ className = "", ...props }: SettingsInputProps) {
  return (
    <input
      className={`w-full rounded-lg border border-border bg-background p-2.5 text-sm text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none font-medium placeholder:text-muted-foreground/30 transition-all ${className}`}
      {...props}
    />
  );
}

interface SettingsSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  className?: string;
}

export function SettingsSelect({ className = "", children, ...props }: SettingsSelectProps) {
  return (
    <div className="relative group">
      <select
        className={`w-full rounded-lg border border-border bg-background p-2.5 text-sm text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none font-medium transition-all appearance-none cursor-pointer ${className}`}
        {...props}
      >
        {children}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
        <svg
          width="8"
          height="5"
          viewBox="0 0 10 6"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M1 1L5 5L9 1"
            stroke="currentColor"
            strokeWidth="2"
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
      className={`cursor-pointer p-5 rounded-xl border transition-all relative overflow-hidden group ${
        isSelected
          ? "bg-card border-primary shadow-sm"
          : "bg-card/40 border-border/40 hover:border-primary/30 hover:bg-card/70"
      } ${className}`}
    >
      {isSelected && (
        <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
      )}
      <div className="flex justify-between items-start mb-2.5">
        <h4 className="font-semibold text-sm tracking-tight flex items-center gap-2 pr-8 text-foreground">
          <div
            className={`w-2 h-2 rounded-full ${
              isSelected ? "bg-primary animate-pulse" : "bg-foreground/20"
            }`}
          />
          {title}
        </h4>
        <div className="flex items-center gap-1.5 relative z-10">
          {isSelected && (
            <div className="bg-primary/10 text-primary p-1 rounded-md backdrop-blur-md mr-0.5">
              <Check className="w-3.5 h-3.5 stroke-[3px]" />
            </div>
          )}
          {actions}
        </div>
      </div>
      {badge && <div className="flex gap-2 mb-2.5">{badge}</div>}
      <div className="text-xs font-medium leading-relaxed text-muted-foreground">
        {children}
      </div>
    </div>
  );
}
