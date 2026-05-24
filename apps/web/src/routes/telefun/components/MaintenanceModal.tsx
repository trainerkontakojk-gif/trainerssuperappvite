import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Home, ArrowRight } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useTelefunWarning } from "../../../context/TelefunWarningContext";

interface MaintenanceModalProps {
  isOpen: boolean;
  role?: string;
}

export const MaintenanceModal = ({ isOpen, role }: MaintenanceModalProps) => {
  const navigate = useNavigate();
  const { closeMaintenance, grantTelefunAccess } = useTelefunWarning();

  const handleRedirect = () => {
    closeMaintenance();
    navigate({ to: "/dashboard" });
  };

  const handleEnterTelefun = () => {
    grantTelefunAccess();
    closeMaintenance();
    navigate({ to: "/telefun" });
  };

  const normalizedRole = role?.toLowerCase().trim();
  const isAllowedRole = ["admin", "trainer", "trainers"].includes(normalizedRole || "");

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-background/80 backdrop-blur-md"
            onClick={isAllowedRole ? undefined : handleRedirect} // Prevent clicking away for disallowed roles unless they use the button, or we can make background non-dismissible
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-sm bg-card border border-destructive/20 rounded-[2.5rem] p-8 shadow-2xl text-center overflow-hidden"
          >
            {/* Background Decorative Element */}
            <div className="absolute top-0 left-0 w-full h-1 bg-destructive/20" />
            
            <div className="w-20 h-20 bg-destructive/10 rounded-3xl mx-auto mb-6 flex items-center justify-center">
              <AlertTriangle className="w-10 h-10 text-destructive" />
            </div>
            
            <h3 className="text-xl font-black text-foreground mb-4 tracking-tight">
              {isAllowedRole ? "Modul Dalam Pengembangan" : "Akses Dibatasi"}
            </h3>
            
            <div className="text-sm text-muted-foreground leading-relaxed mb-2 font-medium px-4">
              {isAllowedRole ? (
                <span>Modul ini masih dalam pengembangan dan mungkin tidak berjalan stabil. Anda dapat melanjutkan atau menggunakan versi Lite yang lebih stabil.</span>
              ) : (
                <span>
                  Modul ini tidak berjalan dengan baik pada aplikasi ini. <br />
                  <span className="text-destructive font-bold">Silakan menghubungi trainer</span> untuk informasi lebih lanjut.
                </span>
              )}
            </div>
            
            {!isAllowedRole && (
              <p className="text-xs text-muted-foreground leading-relaxed mb-8 font-medium px-4">
                Modul Telefun hanya dapat diakses oleh role <span className="text-foreground font-bold">Trainer</span>.
              </p>
            )}

            {isAllowedRole && <div className="mb-6" />}

            <div className="flex flex-col gap-3">
              {isAllowedRole && (
                <>
                  <button
                    onClick={handleEnterTelefun}
                    className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold hover:opacity-90 transition-all shadow-lg flex items-center justify-center gap-3 cursor-pointer"
                  >
                    <ArrowRight className="w-5 h-5" />
                    Lanjut ke Telefun
                  </button>
                  <a
                    href="https://ai.studio/apps/348f1688-2144-42b8-bbd7-656b6e25718e"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-4 bg-secondary text-secondary-foreground rounded-2xl font-bold hover:bg-secondary/80 transition-all border border-border/50 flex items-center justify-center gap-3 cursor-pointer"
                  >
                    <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
                      <span className="text-[10px] font-black">LITE</span>
                    </div>
                    Berpindah ke App Lite
                  </a>
                </>
              )}
              
              <button
                onClick={handleRedirect}
                className="w-full py-4 bg-secondary text-secondary-foreground rounded-2xl font-bold hover:bg-secondary/80 transition-all border border-border/50 flex items-center justify-center gap-3 cursor-pointer"
              >
                <Home className="w-5 h-5" />
                Kembali ke Dashboard
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
