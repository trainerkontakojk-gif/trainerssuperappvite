import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Clock, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function WaitingApprovalPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('auth_token');
    navigate({ to: '/' });
  };

  useEffect(() => {
    const checkStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate({ to: '/' });
        return;
      }

      setEmail(user.email || '');

      const { data: profile } = await supabase
        .from('profiles')
        .select('status, is_deleted')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.is_deleted) {
        await supabase.auth.signOut();
        localStorage.removeItem('auth_token');
        navigate({ to: '/' });
        return;
      }

      if (profile?.status === 'approved') {
        navigate({ to: '/dashboard' });
      } else if (profile?.status === 'rejected') {
        await supabase.auth.signOut();
        localStorage.removeItem('auth_token');
        navigate({ to: '/' });
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Trainers SuperApp</h1>
          <p className="text-sm text-gray-500 mt-1">Workspace internal</p>
        </div>
        <div className="bg-white rounded-2xl border shadow-sm p-6 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
            <Clock className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Menunggu persetujuan</h2>
          <p className="mt-4 text-sm text-gray-500">
            Akun {email && <>({email}) </>}berhasil dibuat dan sedang menunggu verifikasi trainer. Halaman ini akan memeriksa status secara berkala.
          </p>
          <div className="mt-6 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-700">
            Estimasi normal sekitar 1x24 jam. Jika akses dibutuhkan segera, hubungi trainer atau admin Anda.
          </div>
          <button
            onClick={handleLogout}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold hover:bg-gray-50 transition"
          >
            <LogOut className="h-4 w-4" />
            Keluar dari Akun
          </button>
        </div>
      </div>
    </div>
  );
}
