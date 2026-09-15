import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";

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
        <Card className="border-border bg-card py-0">
          <CardHeader className="gap-4 p-6 lg:p-8">
            <div
              className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${accentClassName} border-current/15 bg-current/10`}
            >
              {eyebrow}
            </div>
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className={`flex h-12 w-12 items-center justify-center rounded-xl ${accentSoftClassName} ${accentClassName}`}
            >
              {icon}
            </motion.div>
            <CardTitle className="max-w-3xl text-3xl font-semibold tracking-tight text-balance lg:text-5xl">
              {title}
            </CardTitle>
            <CardDescription className="max-w-3xl text-base leading-7 lg:text-lg">
              {description}
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="border-border bg-card py-0">
          <CardContent className="p-6 lg:p-7">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Workspace actions
            </p>
            <div className="mt-5 space-y-3">{actions}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
