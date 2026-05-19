import { Link } from '@tanstack/react-router';
import { ArrowRight, ChevronRight, Cpu, LockKeyhole, Orbit, PanelsTopLeft, Shield, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { APP_MODULES } from '../lib/app-config';

export default function IndexPage() {
  const [session, setSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(!!data.session));
  }, []);

  const productModules = APP_MODULES.filter((m) =>
    ['ketik', 'pdkt', 'telefun', 'profiler', 'qa-analyzer'].includes(m.id)
  );

  return (
    <main className="relative min-h-screen bg-white">
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-full max-w-[800px] h-[500px] bg-indigo-100/50 blur-[120px]" />
      </div>

      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-600">
              <Cpu className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">Trainers SuperApp</span>
          </div>
          <div className="flex items-center gap-3">
            {session ? (
              <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition">
                Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition">
                Mulai
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative px-6 pt-24 pb-16 lg:px-8 lg:pt-32">
        <div className="mx-auto max-w-7xl text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-5 py-1.5 text-xs font-bold uppercase tracking-widest text-indigo-700">
            <Shield className="h-3.5 w-3.5" />
            Platform Trainer · Workspace internal
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 sm:text-7xl mb-8 max-w-4xl mx-auto leading-[1.05]">
            Satu platform untuk seluruh kebutuhan tim trainer.
          </h1>
          <p className="mx-auto max-w-2xl text-lg leading-8 text-gray-500 mb-10">
            Trainers SuperApp menyatukan semua kebutuhan operasional Anda—mulai dari simulasi chat, email, telepon, profiling, hingga analitik QA.
            Satu ruang kerja yang terpusat agar tim bisa bekerja lebih produktif dan efisien.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {session ? (
              <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-8 py-4 text-base font-bold text-white hover:opacity-90 transition shadow-lg shadow-indigo-200">
                Buka Dashboard
                <ArrowRight className="h-5 w-5" />
              </Link>
            ) : (
              <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-8 py-4 text-base font-bold text-white hover:opacity-90 transition shadow-lg shadow-indigo-200">
                Mulai Sekarang
                <ArrowRight className="h-5 w-5" />
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <div className="w-full border-y bg-gray-50/50 py-8">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {[
              { label: 'Modul Terintegrasi', value: '5 Modul Utama' },
              { label: 'Eksklusif Untuk', value: 'Tim internal' },
              { label: 'Kesiapan Operasional', value: 'Siap Pakai' },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col items-center justify-center space-y-1 text-center">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-400">{stat.label}</span>
                <span className="text-xl font-semibold tracking-tight text-gray-900">{stat.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Module Showcase */}
      <section className="py-24 px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl mb-4">Satu tempat untuk berbagai kebutuhan.</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              Gonta-ganti tugas jadi jauh lebih mulus dengan desain antarmuka yang seragam di tiap modul.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {productModules.map((module, idx) => (
              <div
                key={module.id}
                className="group relative flex flex-col rounded-2xl border bg-white p-6 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-100/50"
              >
                <div className={`mb-6 flex h-12 w-12 items-center justify-center rounded-xl ${module.accentSoftClassName} ${module.accentClassName}`}>
                  <module.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold tracking-tight text-gray-900 mb-2 uppercase">{module.shortTitle}</h3>
                <p className="text-xs leading-relaxed text-gray-500 mt-auto">{module.description}</p>
                <ChevronRight className="absolute bottom-6 right-6 h-4 w-4 opacity-0 transition-all -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 text-gray-400" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24 px-6 lg:px-8 border-t bg-gray-50/30">
        <div className="mx-auto max-w-7xl">
          <div className="grid lg:grid-cols-3 gap-12">
            <div className="lg:col-span-1">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl mb-6">Mengapa platform terpusat?</h2>
              <p className="text-gray-500 text-lg mb-8">
                Kami paham padatnya jadwal tim Anda. Dengan platform terpusat ini, proses operasional jadi lebih ramping agar Anda bisa fokus membantu tim berkembang.
              </p>
              <div className="flex items-center gap-2 text-indigo-600 font-semibold">
                <span>Lihat keunggulan lainnya</span>
                <ArrowRight className="h-5 w-5" />
              </div>
            </div>
            <div className="lg:col-span-2 grid md:grid-cols-2 gap-6">
              {[
                {
                  title: 'Satu akses untuk semua',
                  desc: 'Cukup sekali login untuk mengakses seluruh alat kerja dan simulasi yang Anda butuhkan.',
                  icon: LockKeyhole,
                },
                {
                  title: 'Dasbor yang bersih',
                  desc: 'Tampilan rapi dan bebas distraksi untuk memantau data yang paling penting dari tim Anda.',
                  icon: PanelsTopLeft,
                },
                {
                  title: 'Navigasi konsisten',
                  desc: 'Desain setiap modul dibuat senada, memastikan adaptasi lebih cepat ketika Anda berganti fungsi.',
                  icon: Orbit,
                },
                {
                  title: 'Hemat waktu',
                  desc: 'Tinggalkan pekerjaan manual—sekarang Anda punya lebih banyak waktu untuk rekan kerja.',
                  icon: Sparkles,
                },
              ].map((item) => (
                <div key={item.title} className="p-8 rounded-2xl bg-white border hover:bg-gray-50 transition-colors">
                  <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3">{item.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-24 px-6 lg:px-8 bg-indigo-50/30">
        <div className="mx-auto max-w-7xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl mb-6">Siap beralih ke cara kerja yang lebih baik?</h2>
          <p className="text-gray-500 text-lg mb-10 max-w-2xl mx-auto">
            Sederhanakan alur pelatihan dan pantau target operasional tim Anda dalam satu layar.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {session ? (
              <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-8 py-4 text-base font-bold text-white hover:opacity-90 transition shadow-lg shadow-indigo-200">
                Buka Dashboard
                <ArrowRight className="h-5 w-5" />
              </Link>
            ) : (
              <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-8 py-4 text-base font-bold text-white hover:opacity-90 transition shadow-lg shadow-indigo-200">
                Mulai Sekarang
                <ArrowRight className="h-5 w-5" />
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-10 px-6 lg:px-8 bg-gray-50">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-6 text-gray-500">
          <div className="flex items-center gap-3">
            <Cpu className="h-5 w-5" />
            <p className="text-xs tracking-tight">&copy; 2026 Trainers SuperApp</p>
          </div>
          <div className="flex items-center gap-8 text-xs font-semibold uppercase tracking-widest text-gray-400">
            <span>Pusat Kendali</span>
            <span>Integritas</span>
            <span>Layanan</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
