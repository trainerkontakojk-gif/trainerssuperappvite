import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  ClipboardList,
  Medal,
  Settings,
  CalendarDays,
  Users,
  ArrowRight,
} from "lucide-react";

const modules = [
  {
    title: "Dashboard",
    desc: "Ringkasan performa QA",
    icon: BarChart3,
    href: "/sidak/dashboard",
    color: "bg-blue-500",
  },
  {
    title: "Input Audit",
    desc: "Input temuan dan upload Excel",
    icon: ClipboardList,
    href: "/sidak/input",
    color: "bg-green-500",
  },
  {
    title: "Agents",
    desc: "Data agent dan detail skor",
    icon: Users,
    href: "/sidak/agents",
    color: "bg-purple-500",
  },
  {
    title: "Ranking",
    desc: "Peringkat agent berdasarkan defect",
    icon: Medal,
    href: "/sidak/ranking",
    color: "bg-amber-500",
  },
  {
    title: "Periode",
    desc: "Kelola periode audit",
    icon: CalendarDays,
    href: "/sidak/periods",
    color: "bg-rose-500",
  },
  {
    title: "Settings",
    desc: "Bobot service dan parameter",
    icon: Settings,
    href: "/sidak/settings",
    color: "bg-slate-500",
  },
];

export default function SidakLanding() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">SIDAK</h2>
        <p className="text-gray-500 mt-1">
          Sistem Informasi Data Analisis Kualitas
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((m) => (
          <Link
            key={m.href}
            to={m.href}
            className="group p-6 bg-white rounded-xl border shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
          >
            <div
              className={`w-10 h-10 ${m.color} rounded-lg flex items-center justify-center mb-3`}
            >
              <m.icon size={20} className="text-white" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{m.title}</h3>
                <p className="text-sm text-gray-500">{m.desc}</p>
              </div>
              <ArrowRight
                size={18}
                className="text-gray-300 group-hover:text-gray-600 transition-colors"
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
