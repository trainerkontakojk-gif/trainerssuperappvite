import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  LayoutDashboard,
  Users,
  Trophy,
  FileText,
  ArrowRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuthStore } from "../../store/authStore";

const CARDS = [
  {
    title: "Dashboard",
    desc: "Pusat kendali utama menampilkan ringkasan metrik secara real-time dan tren kinerja operasional.",
    icon: LayoutDashboard,
    href: "/sidak/dashboard",
    color: "blue",
  },
  {
    title: "Analisis Individu",
    desc: "Pemeriksaan mendalam terhadap riwayat, log aktivitas, dan pencapaian target spesifik tiap agen.",
    icon: Users,
    href: "/sidak/agents",
    color: "emerald",
  },
  {
    title: "Ranking Agen",
    desc: "Papan peringkat berbasis data algoritma komposit untuk mengidentifikasi top performer.",
    icon: Trophy,
    href: "/sidak/ranking",
    color: "amber",
  },
  {
    title: "Laporan",
    desc: "Ekstraksi data historis dan generasi laporan audit dalam berbagai format standar institusi.",
    icon: FileText,
    href: "/sidak/reports",
    color: "violet",
    managerOnly: true,
  },
];

const colorConfig: Record<string, { border: string; bg: string; text: string; hoverBorder: string; hoverShadow: string; iconBg: string; iconGroupBg: string; linkText: string }> = {
  blue: {
    border: "hover:border-blue-500/30",
    bg: "bg-blue-500/10",
    text: "text-blue-500",
    hoverBorder: "group-hover:border-blue-500/30",
    hoverShadow: "hover:shadow-blue-500/5",
    iconBg: "group-hover:bg-blue-500",
    iconGroupBg: "bg-blue-500/10",
    linkText: "text-blue-500",
  },
  emerald: {
    border: "hover:border-emerald-500/30",
    bg: "bg-emerald-500/10",
    text: "text-emerald-500",
    hoverBorder: "group-hover:border-emerald-500/30",
    hoverShadow: "hover:shadow-emerald-500/5",
    iconBg: "group-hover:bg-emerald-500",
    iconGroupBg: "bg-emerald-500/10",
    linkText: "text-emerald-500",
  },
  amber: {
    border: "hover:border-amber-500/30",
    bg: "bg-amber-500/10",
    text: "text-amber-500",
    hoverBorder: "group-hover:border-amber-500/30",
    hoverShadow: "hover:shadow-amber-500/5",
    iconBg: "group-hover:bg-amber-500",
    iconGroupBg: "bg-amber-500/10",
    linkText: "text-amber-500",
  },
  violet: {
    border: "hover:border-violet-500/30",
    bg: "bg-violet-500/10",
    text: "text-violet-500",
    hoverBorder: "group-hover:border-violet-500/30",
    hoverShadow: "hover:shadow-violet-500/5",
    iconBg: "group-hover:bg-violet-500",
    iconGroupBg: "bg-violet-500/10",
    linkText: "text-violet-500",
  },
};

export default function SidakLanding() {
  const profile = useAuthStore((s) => s.profile);
  const role = profile?.role ?? "";
  const isManager = ["trainer", "admin"].includes(role?.toLowerCase());

  const visibleCards = CARDS.filter(
    (c) => !c.managerOnly || isManager,
  );

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-10">
          {/* Hero Welcome Card */}
          <div className="relative overflow-hidden rounded-[2.5rem] border border-border/50 bg-card/40 p-8 sm:p-10 lg:p-12 backdrop-blur-xl shadow-xl shadow-black/5">
            <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

            <div className="relative z-10 max-w-3xl">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-6">
                <BarChart3 className="h-3.5 w-3.5" />
                Modul Utama
              </div>
              <h2 className="text-4xl font-black tracking-tight text-foreground lg:text-5xl mb-4">
                Selamat Datang di SIDAK
              </h2>
              <p className="text-base leading-relaxed text-muted-foreground lg:text-lg">
                Pusat kendali analisis kualitas. Pantau performa agen, identifikasi area perbaikan, dan hasilkan laporan komprehensif untuk mendorong pertumbuhan dan kualitas layanan yang lebih baik.
              </p>
            </div>
          </div>

          {/* Module Cards */}
          <div>
            <div className="mb-6">
              <h3 className="text-xl font-bold tracking-tight">Pilih Modul</h3>
              <p className="text-sm text-muted-foreground">
                Akses fitur analitik dan laporan SIDAK.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {visibleCards.map((card) => {
                const c = colorConfig[card.color];
                return (
                  <Link key={card.href} to={card.href} className="block h-full">
                    <motion.div
                      whileHover={{ y: -5 }}
                      className={`group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border/50 bg-card/40 p-6 backdrop-blur-sm transition-all hover:bg-card/60 ${c.border} ${c.hoverShadow}`}
                    >
                      <div
                        className={`mb-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${c.iconGroupBg} ${c.text} transition-colors ${c.iconBg} group-hover:text-white`}
                      >
                        <card.icon className="h-6 w-6" />
                      </div>
                      <h4 className="text-lg font-bold tracking-tight text-foreground">
                        {card.title}
                      </h4>
                      <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
                        {card.desc}
                      </p>
                      <div
                        className={`mt-6 flex items-center text-[10px] font-bold uppercase tracking-widest ${c.linkText} opacity-0 transition-opacity group-hover:opacity-100`}
                      >
                        Buka Modul <ArrowRight className="ml-1 h-3 w-3" />
                      </div>
                    </motion.div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
