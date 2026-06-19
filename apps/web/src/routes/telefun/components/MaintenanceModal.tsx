import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Home, ArrowRight } from "lucide-react";
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

  if (isAllowedRole) {
    return null;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-background/80 backdrop-blur-md"
            onClick={handleRedirect}
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
              <Lock className="w-10 h-10 text-destructive" />
            </div>
            
            <h3 className="text-xl font-black text-foreground mb-4 tracking-tight">
              Akses Terbatas
            </h3>
            
            <div className="text-sm text-muted-foreground leading-relaxed mb-6 font-medium px-4">
              Modul Telefun hanya dapat diakses oleh Trainer.
            </div>

            <div className="flex flex-col gap-3">
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
