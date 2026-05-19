import { Link, Outlet } from '@tanstack/react-router';
import { LayoutDashboard, MessageSquare, Phone, Settings, User } from 'lucide-react';

export function DashboardLayout() {
  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r flex flex-col">
        <div className="p-6 font-bold text-xl text-indigo-600">Trainers App</div>
        <nav className="flex-1 p-4 space-y-2">
          <Link to="/dashboard" className="flex items-center gap-3 p-2 rounded hover:bg-gray-100 transition-colors [&.active]:bg-indigo-50 [&.active]:text-indigo-600">
            <LayoutDashboard size={20} /> 
            <span className="text-sm font-medium">Dashboard</span>
          </Link>
          <Link to="/sidak" className="flex items-center gap-3 p-2 rounded hover:bg-gray-100 transition-colors [&.active]:bg-indigo-50 [&.active]:text-indigo-600">
            <MessageSquare size={20} /> 
            <span className="text-sm font-medium">SIDAK</span>
          </Link>
          <Link to="/settings" className="flex items-center gap-3 p-2 rounded hover:bg-gray-100 transition-colors [&.active]:bg-indigo-50 [&.active]:text-indigo-600">
            <Settings size={20} /> 
            <span className="text-sm font-medium">Settings</span>
          </Link>
        </nav>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b flex items-center justify-end px-8">
          <div className="flex items-center gap-3">
             <span className="text-sm font-semibold text-gray-700">User</span>
             <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                <User size={18} />
             </div>
          </div>
        </header>
        <section className="flex-1 overflow-auto p-8">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
