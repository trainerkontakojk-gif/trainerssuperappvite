import { Suspense } from 'react';
import { ArrowRight, ChevronRight, Cpu, LockKeyhole, Orbit, PanelsTopLeft, Shield, Sparkles } from 'lucide-react';
import { APP_MODULES } from '../lib/app-config';
import { LandingAuthProvider, NavbarAuthActions, HeroAuthActions, FooterAuthActions } from '../components/LandingAuthClient';

export default function IndexPage() {
  const productModules = APP_MODULES.filter((module) => 
    ['ketik', 'pdkt', 'telefun', 'profiler', 'qa-analyzer'].includes(module.id)
  );

  return (
    <main className="relative min-h-screen bg-background text-foreground transition-colors duration-500 w-full overflow-x-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-full max-w-[800px] h-[500px] bg-primary/10 blur-[120px] opacity-60 dark:bg-primary/5" />
        <div 
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" 
          style={{ backgroundImage: 'radial-gradient(circle at 1.5px 1.5px, currentColor 1.5px, transparent 0)', backgroundSize: '48px 48px' }} 
        />
      </div>

      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            <p className="text-sm font-medium text-muted-foreground">Menyiapkan platform...</p>
          </div>
        </div>
      }>
        <LandingAuthProvider>
          <div className="relative z-10 flex flex-col min-h-screen">
            {/* Navbar */}
            <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
              <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/5 text-primary shadow-sm shadow-primary/5">
                    <Cpu className="h-5 w-5" />
                  </div>
                  <div className="flex flex-col leading-none">
                    <span className="font-display text-lg font-black tracking-tighter text-foreground">Trainers SuperApp</span>
                  </div>
                </div>
                <NavbarAuthActions />
              </div>
            </header>

            {/* Hero Section */}
            <section className="relative px-6 pt-24 pb-16 lg:px-8 lg:pt-32">
              <div className="mx-auto max-w-7xl text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                  <Shield className="h-3.5 w-3.5" />
                  Platform Trainer · Workspace internal
                </div>
                
                <h1 className="font-display text-5xl font-extrabold tracking-tight text-foreground sm:text-7xl mb-8 max-w-4xl mx-auto leading-[1.05]">
                  Satu platform untuk seluruh kebutuhan tim trainer.
                </h1>
                
                <p className="mx-auto max-w-2xl text-lg leading-8 text-muted-foreground mb-10">
                  Trainers SuperApp menyatukan semua kebutuhan operasional Anda—mulai dari simulasi chat, email, telepon, profiling, hingga analitik QA. 
                  Satu ruang kerja yang terpusat agar tim bisa bekerja lebih produktif dan efisien.
                </p>
                
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <HeroAuthActions />
                </div>
              </div>
            </section>

            {/* Trust Bar / Stats */}
            <div className="w-full border-y border-border/40 bg-muted/20 py-8">
              <div className="mx-auto max-w-7xl px-6 lg:px-8">
                <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
                  {[
                    { label: 'Modul Terintegrasi', value: '5 Modul Utama' },
                    { label: 'Eksklusif Untuk', value: 'Tim internal' },
                    { label: 'Kesiapan Operasional', value: 'Siap Pakai' }
                  ].map((stat) => (
                    <div key={stat.label} className="flex flex-col items-center justify-center space-y-1 text-center">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{stat.label}</span>
                      <span className="text-xl font-semibold tracking-tight">{stat.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Module Showcase */}
            <section className="py-24 px-6 lg:px-8 bg-background">
              <div className="mx-auto max-w-7xl">
                <div className="text-center mb-16">
                  <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">Satu tempat untuk berbagai kebutuhan.</h2>
                  <p className="text-muted-foreground max-w-2xl mx-auto">
                    Gonta-ganti tugas jadi jauh lebih mulus dengan desain antarmuka yang seragam di tiap modul.
                  </p>
                </div>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 h-full">
                  {productModules.map((module, idx) => (
                    <div
                      key={module.id}
                      className="group relative flex flex-col h-full rounded-2xl border border-border/50 bg-card p-6 transition-all hover:-translate-y-1 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5 animate-in fade-in slide-in-from-bottom-8"
                      style={{ animationDuration: '700ms', animationFillMode: 'both', animationDelay: `${idx * 100}ms` }}
                    >
                      <div className={`mb-6 flex h-12 w-12 items-center justify-center rounded-xl ${module.accentSoftClassName} ${module.accentClassName} transition-colors group-hover:bg-primary group-hover:text-primary-foreground`}>
                        <module.icon className="h-6 w-6" />
                      </div>
                      <h3 className="text-lg font-bold tracking-tight mb-2 uppercase">{module.shortTitle}</h3>
                      <p className="text-xs leading-relaxed text-muted-foreground mt-auto">
                        {module.id === 'ketik' && 'Simulasi interaktif untuk melatih penanganan chat pelanggan.'}
                        {module.id === 'pdkt' && 'Penyusunan penulisan email dengan draf terpandu dan asisten AI cerdas.'}
                        {module.id === 'telefun' && 'Skenario penanganan telepon berdasarkan kasus interaksi sebenarnya di lapangan.'}
                        {module.id === 'profiler' && 'Sistem pengadaan data operasional dari rekam performa histori para agen.'}
                        {module.id === 'qa-analyzer' && 'Pantauan analitikal untuk visibilitas hasil peringkat kualitas dari penilaian QA.'}
                      </p>
                      <ChevronRight className="absolute bottom-6 right-6 h-4 w-4 opacity-0 transition-all -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0" />
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Benefits Section */}
            <section className="py-24 px-6 lg:px-8 border-t border-border/40">
              <div className="mx-auto max-w-7xl">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                  <div className="lg:col-span-1">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">Mengapa platform terpusat?</h2>
                    <p className="text-muted-foreground text-lg mb-8">
                      Kami paham padatnya jadwal tim Anda. Dengan platform terpusat ini, proses operasional jadi lebih ramping agar Anda bisa fokus membantu tim berkembang.
                    </p>
                    <div className="flex items-center gap-2 text-primary font-semibold">
                      <span>Lihat keunggulan lainnya</span>
                      <ArrowRight className="h-5 w-5" />
                    </div>
                  </div>
                  
                  <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[
                      {
                        title: 'Satu akses untuk semua',
                        desc: 'Cukup sekali login untuk mengakses seluruh alat kerja dan simulasi yang Anda butuhkan.',
                        icon: LockKeyhole
                      },
                      {
                        title: 'Dasbor yang bersih',
                        desc: 'Tampilan rapi dan bebas distraksi untuk memantau data yang paling penting dari tim Anda.',
                        icon: PanelsTopLeft
                      },
                      {
                        title: 'Navigasi konsisten',
                        desc: 'Desain setiap modul dibuat senada, memastikan adaptasi lebih cepat ketika Anda berganti antara fungsi simulasi dan rekap data.',
                        icon: Orbit
                      },
                      {
                        title: 'Hemat waktu',
                        desc: 'Tinggalkan banyak sekali pekerjaan manual—sekarang Anda punya lebih banyak waktu bebas untuk rekan kerja.',
                        icon: Sparkles
                      }
                    ].map((item) => (
                      <div key={item.title} className="p-8 rounded-3xl bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors">
                        <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <item.icon className="h-5 w-5" />
                        </div>
                        <h3 className="text-lg font-bold mb-3">{item.title}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Footer CTA */}
            <section className="relative overflow-hidden py-24 px-6 lg:px-8">
              <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
              <div className="relative mx-auto max-w-7xl text-center">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">Siap beralih ke cara kerja yang lebih baik?</h2>
                <p className="text-muted-foreground text-lg mb-10 max-w-2xl mx-auto">
                  Sederhanakan alur pelatihan dan pantau target operasional tim Anda dalam satu layar.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <FooterAuthActions />
                </div>
              </div>
            </section>

            {/* Footer */}
            <footer className="mt-auto border-t border-border/40 py-10 px-6 lg:px-8 bg-muted/10">
              <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-6 text-muted-foreground">
                <div className="flex items-center gap-3">
                   <Cpu className="h-5 w-5" />
                   <p className="text-xs tracking-tight">© 2026 Trainers SuperApp — Fajar Abd</p>
                </div>
                <div className="flex items-center gap-8 text-xs font-semibold uppercase tracking-widest">
                   <span>Pusat Kendali</span>
                   <span>Integritas</span>
                   <span>Layanan</span>
                </div>
              </div>
            </footer>
          </div>
        </LandingAuthProvider>
      </Suspense>
    </main>
  );
}
