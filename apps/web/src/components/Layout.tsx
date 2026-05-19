import { Outlet, Link, useLocation } from '@tanstack/react-router';
import { LayoutDashboard, MessageCircle, Mail, Settings, User, BarChart3, Phone, ChevronDown, Activity, Users, Loader2, Layers, UserCheck } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { Suspense, useState } from 'react';

const SIDAK_CHILDREN = [
  { to: '/sidak', label: 'Beranda SIDAK' },
  { to: '/sidak/dashboard', label: 'Dashboard QA' },
  { to: '/sidak/agents', label: 'Analisis Individu', startsWith: true },
  { to: '/sidak/ranking', label: 'Ranking Agen' },
  { to: '/sidak/reports', label: 'Laporan' },
  { to: '/sidak/input', label: 'Input Temuan' },
  { to: '/sidak/periods', label: 'Periode QA' },
  { to: '/sidak/settings', label: 'Parameter QA' },
];

export function DashboardLayout() {
  const profile = useAuthStore((s) => s.profile);
  const { pathname } = useLocation();
  const [sidakOpen, setSidakOpen] = useState(pathname.startsWith('/sidak'));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string, startsWith = false) =>
    startsWith ? pathname.startsWith(path) : pathname === path;

  const linkClass = (path: string, startsWith = false) =>
    `flex items-center gap-3 p-2 rounded-lg transition-colors text-sm font-medium ${
      isActive(path, startsWith) ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  const isManager = profile?.role?.toLowerCase() === 'admin' || profile?.role?.toLowerCase() === 'trainer';

  return (
    <div className="flex h-screen bg-gray-50">
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/20 z-40 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      <aside className={`${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r flex flex-col transition-transform duration-300`}>
        <div className="p-6 font-bold text-xl text-indigo-600 flex items-center gap-3 border-b">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-indigo-600" />
          </div>
          Trainers App
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <Link to="/dashboard" className={linkClass('/dashboard')} onClick={() => setMobileMenuOpen(false)}>
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </Link>

          <div>
            <button
              onClick={() => setSidakOpen(!sidakOpen)}
              className={`w-full flex items-center justify-between gap-3 p-2 rounded-lg transition-colors text-sm font-medium ${
                pathname.startsWith('/sidak') ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <BarChart3 size={20} />
                <span>SIDAK</span>
              </div>
              <ChevronDown size={16} className={`transition-transform ${sidakOpen ? '' : '-rotate-90'}`} />
            </button>
            {sidakOpen && (
              <div className="ml-6 mt-1 space-y-1 border-l pl-3">
                {SIDAK_CHILDREN.map((child) => (
                  <Link
                    key={child.to}
                    to={child.to}
                    className={`block p-2 rounded-lg text-xs font-medium transition-colors ${
                      isActive(child.to, child.startsWith) ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link to="/ketik" className={linkClass('/ketik', true)} onClick={() => setMobileMenuOpen(false)}>
            <MessageCircle size={20} />
            <span>KETIK</span>
          </Link>
          <Link to="/pdkt" className={linkClass('/pdkt', true)} onClick={() => setMobileMenuOpen(false)}>
            <Mail size={20} />
            <span>PDKT</span>
          </Link>
          <Link to="/telefun" className={linkClass('/telefun', true)} onClick={() => setMobileMenuOpen(false)}>
            <Phone size={20} />
            <span>Telefun</span>
          </Link>
          <Link to="/profiler" className={linkClass('/profiler', true)} onClick={() => setMobileMenuOpen(false)}>
            <Users size={20} />
            <span>KTP / Profiler</span>
          </Link>
          <Link to="/monitoring" className={linkClass('/monitoring')} onClick={() => setMobileMenuOpen(false)}>
            <Activity size={20} />
            <span>Monitoring</span>
          </Link>

          {isManager && (
            <>
              <div className="pt-4 pb-2 px-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Admin Panel
              </div>
              <Link to="/dashboard/users" className={linkClass('/dashboard/users')} onClick={() => setMobileMenuOpen(false)}>
                <User size={20} />
                <span>Kelola Pengguna</span>
              </Link>
              <Link to="/dashboard/access-groups" className={linkClass('/dashboard/access-groups')} onClick={() => setMobileMenuOpen(false)}>
                <Layers size={20} />
                <span>Grup Akses</span>
              </Link>
              <Link to="/dashboard/access-approval" className={linkClass('/dashboard/access-approval')} onClick={() => setMobileMenuOpen(false)}>
                <UserCheck size={20} />
                <span>Persetujuan Akses</span>
              </Link>
              <Link to="/dashboard/activities" className={linkClass('/dashboard/activities')} onClick={() => setMobileMenuOpen(false)}>
                <Activity size={20} />
                <span>Log Aktivitas</span>
              </Link>
            </>
          )}

          <div className="border-t my-4" />

          <Link to="/account" className={linkClass('/account')} onClick={() => setMobileMenuOpen(false)}>
            <User size={20} />
            <span>Akun</span>
          </Link>
          <Link to="/sidak/settings" className={linkClass('/sidak/settings')} onClick={() => setMobileMenuOpen(false)}>
            <Settings size={20} />
            <span>Pengaturan</span>
          </Link>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b flex items-center justify-between px-4 lg:px-8">
          <button className="lg:hidden p-2 rounded-lg hover:bg-gray-100" onClick={() => setMobileMenuOpen(true)}>
            <BarChart3 size={20} />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-700">{profile?.full_name || 'User'}</span>
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
              <User size={18} />
            </div>
          </div>
        </header>
        <section className="flex-1 overflow-auto p-6 lg:p-8">
          <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
            <Outlet />
          </Suspense>
        </section>
      </main>
    </div>
  );
}
