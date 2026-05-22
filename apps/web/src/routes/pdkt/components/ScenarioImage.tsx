import React from "react";
import { getImageDataUri } from "../utils/detectMimeType";

interface ScenarioImageProps {
  base64: string;
  alt?: string;
  variant: "grid" | "thumbnail" | "fullscreen";
  onClick?: () => void;
  className?: string;
}

export default function ScenarioImage({
  base64,
  alt = "Scenario image",
  variant,
  onClick,
  className = "",
}: ScenarioImageProps) {
  const src = getImageDataUri(base64);

  if (variant === "fullscreen") {
    return (
      <img
        src={src}
        alt={alt}
        className={`object-contain max-w-full max-h-full rounded-xl ${className}`}
        onClick={onClick}
      />
    );
  }

  if (variant === "thumbnail") {
    return (
      <div
        className={`relative min-w-20 min-h-20 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center ${className}`}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
      >
        <img src={src} alt={alt} className="object-contain w-full h-full" />
      </div>
    );
  }

  // variant === 'grid'
  return (
    <div
      className={`relative aspect-[4/3] bg-gray-100 rounded-lg border border-gray-200 overflow-hidden flex items-center justify-center ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <img src={src} alt={alt} className="object-contain w-full h-full" />
    </div>
  );
}
