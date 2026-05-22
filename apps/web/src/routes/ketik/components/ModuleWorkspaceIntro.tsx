import type { ReactNode } from "react";
import { motion } from "framer-motion";

interface ModuleWorkspaceIntroProps {
  eyebrow: string;
  title: string;
  description: string;
  accentClassName: string;
  accentSoftClassName: string;
  icon: ReactNode;
  actions: ReactNode;
}

export default function ModuleWorkspaceIntro({
  eyebrow,
  title,
  description,
  accentClassName,
  accentSoftClassName,
  icon,
  actions,
}: ModuleWorkspaceIntroProps) {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-8 lg:py-10">
      <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[2rem] border border-border/50 bg-card/75 p-7 shadow-xl shadow-black/5 backdrop-blur-xl lg:p-8">
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] ${accentClassName} border-current/15 bg-current/8`}
          >
            {eyebrow}
          </div>
          <div className="mt-5 space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className={`flex h-16 w-16 items-center justify-center rounded-3xl ${accentSoftClassName} ${accentClassName}`}
            >
              {icon}
            </motion.div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance lg:text-5xl">
              {title}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-muted-foreground lg:text-lg">
              {description}
            </p>
          </div>
        </section>

        <aside className="rounded-[2rem] border border-border/50 bg-card/65 p-6 backdrop-blur-xl lg:p-7">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
            Workspace actions
          </p>
          <div className="mt-5 space-y-3">{actions}</div>
        </aside>
      </div>
    </div>
  );
}
