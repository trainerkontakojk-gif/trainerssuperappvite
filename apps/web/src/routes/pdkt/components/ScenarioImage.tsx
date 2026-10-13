import React from "react";
import { FileText } from "lucide-react";
import { getAttachmentDataUri, isPdfAttachment } from "../utils/detectMimeType";

interface ScenarioImageProps {
  base64: string;
  alt?: string;
  variant: "grid" | "thumbnail" | "fullscreen";
  onClick?: () => void;
  className?: string;
}

export default function ScenarioImage({
  base64,
  alt = "Lampiran",
  variant,
  onClick,
  className = "",
}: ScenarioImageProps) {
  const src = getAttachmentDataUri(base64);
  const isPdf = isPdfAttachment(base64);

  const interactiveProps = onClick
    ? {
        onClick,
        role: "button",
        tabIndex: 0,
        "aria-label": isPdf ? `${alt} (PDF)` : alt,
        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        },
      }
    : {};
  const interactiveClass = onClick
    ? "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
    : "";

  if (variant === "fullscreen") {
    if (isPdf) {
      return (
        <iframe
          src={src}
          title={alt}
          className={`max-w-full max-h-full rounded-xl bg-card ${className}`}
        />
      );
    }

    return (
      <img
        src={src}
        alt={alt}
        className={`object-contain max-w-full max-h-full rounded-xl ${className}`}
        onClick={onClick}
      />
    );
  }

  if (isPdf) {
    return (
      <div
        className={`relative min-w-20 min-h-20 bg-background rounded-lg border border-border overflow-hidden flex flex-col items-center justify-center gap-1 text-foreground ${interactiveClass} ${className}`}
        {...interactiveProps}
      >
        <FileText className="w-5 h-5 text-fg2" />
        <span className="text-xs font-semibold leading-none text-fg2">PDF</span>
      </div>
    );
  }

  if (variant === "thumbnail") {
    return (
      <div
        className={`relative min-w-20 min-h-20 bg-background rounded-lg overflow-hidden flex items-center justify-center ${interactiveClass} ${className}`}
        {...interactiveProps}
      >
        <img
          src={src}
          alt={alt}
          aria-hidden={onClick ? true : undefined}
          className="object-contain w-full h-full"
        />
      </div>
    );
  }

  // variant === 'grid'
  return (
    <div
      className={`relative aspect-[4/3] bg-background rounded-lg border border-border overflow-hidden flex items-center justify-center ${interactiveClass} ${className}`}
      {...interactiveProps}
    >
      <img
        src={src}
        alt={alt}
        aria-hidden={onClick ? true : undefined}
        className="object-contain w-full h-full"
      />
    </div>
  );
}
