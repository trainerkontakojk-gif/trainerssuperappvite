import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  LayoutDashboard,
  LineChart,
  Users,
  Trophy,
  FileText,
  ArrowRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuthStore } from "../../store/authStore";
import LeaderAccessGate from "../../components/LeaderAccessGate";
import { Card, CardContent } from "../../components/ui/card";

const CARDS = [
  {
    title: "Dashboard",
    desc: "Pusat kendali utama menampilkan ringkasan metrik secara real-time dan tren kinerja operasional.",
    icon: LayoutDashboard,
    href: "/sidak/dashboard",
  },
  {
    title: "Forecast",
    desc: "Proyeksi tren temuan dan sinyal agent untuk membaca arah perbaikan lebih awal.",
    icon: LineChart,
    href: "/sidak/forecast",
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

  const visibleCards = CARDS.filter((c) => !c.managerOnly || isManager);

  return (
    <LeaderAccessGate module="sidak" moduleLabel="SIDAK">
      <div className="flex flex-1 flex-col">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-10">
            {/* Hero Welcome Card */}
            <Card className="border-border bg-card py-0">
              <CardContent className="p-8 sm:p-10 lg:p-12">
                <div className="max-w-3xl">
                  <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <BarChart3 aria-hidden="true" className="h-3.5 w-3.5" />
                    Modul Utama
                  </div>
                  <h2 className="text-4xl font-semibold tracking-tight text-foreground lg:text-5xl">
                    Selamat Datang di SIDAK
                  </h2>
                  <p className="mt-4 text-base leading-relaxed text-muted-foreground lg:text-lg">
                    Pusat kendali analisis kualitas. Pantau performa agen,
                    identifikasi area perbaikan, dan hasilkan laporan
                    komprehensif untuk mendorong pertumbuhan dan kualitas
                    layanan yang lebih baik.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Module Cards */}
            <div>
              <div className="mb-6">
                <h3 className="font-outfit text-xl font-bold tracking-tight text-foreground">
                  Pilih Modul
                </h3>
                <p className="text-sm text-muted-foreground">
                  Akses fitur analitik, prediksi, dan laporan SIDAK.
                </p>
              </div>

              <div
                className={`grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 ${visibleCards.length >= 5 ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}
              >
                {visibleCards.map((card) => {
                  return (
                    <Link
                      key={card.href}
                      to={card.href}
                      className="block h-full"
                    >
                      <motion.div whileHover={{ y: -2 }} className="h-full">
                        <Card className="group flex h-full flex-col border-border bg-card py-0 transition-colors hover:border-foreground/20">
                          <CardContent className="flex h-full flex-col p-6">
                            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
                              <card.icon
                                aria-hidden="true"
                                className="h-5 w-5"
                              />
                            </div>
                            <h4 className="text-base font-semibold tracking-tight text-foreground">
                              {card.title}
                            </h4>
                            <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
                              {card.desc}
                            </p>
                            <div className="mt-6 flex items-center text-[11px] font-semibold text-muted-foreground transition-colors group-hover:text-foreground">
                              Buka Modul <ArrowRight className="ml-1 h-3 w-3" />
                            </div>
                          </CardContent>
                        </Card>
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
