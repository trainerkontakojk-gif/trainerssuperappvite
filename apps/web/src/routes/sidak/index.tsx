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
import LeaderAccessGate from "../../components/LeaderAccessGate";

const CARDS = [
  {
    title: "Dashboard",
    desc: "Pusat kendali utama menampilkan ringkasan metrik secara real-time dan tren kinerja operasional.",
    icon: LayoutDashboard,
    href: "/sidak/dashboard",
  },
  {
    title: "Analisis Individu",
    desc: "Pemeriksaan mendalam terhadap riwayat, log aktivitas, dan pencapaian target spesifik tiap agen.",
    icon: Users,
    href: "/sidak/agents",
  },
  {
    title: "Ranking Agen",
    desc: "Papan peringkat berbasis data algoritma komposit untuk mengidentifikasi top performer.",
    icon: Trophy,
    href: "/sidak/ranking",
  },
  {
    title: "Laporan",
    desc: "Ekstraksi data historis dan generasi laporan audit dalam berbagai format standar institusi.",
    icon: FileText,
    href: "/sidak/reports",
    managerOnly: true,
  },
];

export default function SidakLanding() {
  const profile = useAuthStore((s) => s.profile);
  const role = profile?.role ?? "";
  const isManager = ["trainer", "admin"].includes(role?.toLowerCase());

  const visibleCards = CARDS.filter(
    (c) => !c.managerOnly || isManager,
  );

  return (
    <LeaderAccessGate module="sidak" moduleLabel="SIDAK">
      <div className="flex flex-1 flex-col">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-10">
            {/* Hero Welcome Card */}
            <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-8 sm:p-10 lg:p-12">
              <div className="relative z-10 max-w-3xl">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-6">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Modul Utama
                </div>
                <h2 className="font-outfit text-4xl font-black tracking-tight text-foreground lg:text-5xl mb-4">
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
                <h3 className="font-outfit text-xl font-bold tracking-tight text-foreground">Pilih Modul</h3>
                <p className="text-sm text-muted-foreground">
                  Akses fitur analitik dan laporan SIDAK.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                {visibleCards.map((card) => {
                  return (
                    <Link key={card.href} to={card.href} className="block h-full">
                      <motion.div
                        whileHover={{ y: -2 }}
                        className="group flex h-full flex-col rounded-2xl border border-border bg-surface p-6 transition-all hover:border-foreground/20"
                      >
                        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground group-hover:bg-foreground group-hover:text-background transition-colors">
                          <card.icon className="h-5 w-5" />
                        </div>
                        <h4 className="font-outfit text-base font-bold tracking-tight text-foreground">
                          {card.title}
                        </h4>
                        <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
                          {card.desc}
                        </p>
                        <div className="mt-6 flex items-center text-[11px] font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
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
    </LeaderAccessGate>
  );
}
