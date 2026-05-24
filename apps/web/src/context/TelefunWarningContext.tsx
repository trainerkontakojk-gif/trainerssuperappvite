import React, { createContext, useContext, useState, ReactNode } from "react";

interface TelefunWarningContextType {
  isMaintenanceOpen: boolean;
  openMaintenance: () => void;
  closeMaintenance: () => void;
  hasTelefunAccess: boolean;
  grantTelefunAccess: () => void;
  revokeTelefunAccess: () => void;
}

const TelefunWarningContext = createContext<TelefunWarningContextType | undefined>(undefined);

export function TelefunWarningProvider({ children }: { children: ReactNode }) {
  const [isMaintenanceOpen, setIsMaintenanceOpen] = useState(false);
  const [hasTelefunAccess, setHasTelefunAccess] = useState(false);

  const openMaintenance = () => setIsMaintenanceOpen(true);
  const closeMaintenance = () => setIsMaintenanceOpen(false);
  const grantTelefunAccess = () => setHasTelefunAccess(true);
  const revokeTelefunAccess = () => setHasTelefunAccess(false);

  return (
    <TelefunWarningContext.Provider
      value={{
        isMaintenanceOpen,
        openMaintenance,
        closeMaintenance,
        hasTelefunAccess,
        grantTelefunAccess,
        revokeTelefunAccess,
      }}
    >
      {children}
    </TelefunWarningContext.Provider>
  );
}

export function useTelefunWarning() {
  const context = useContext(TelefunWarningContext);
  if (context === undefined) {
    throw new Error("useTelefunWarning must be used within a TelefunWarningProvider");
  }
  return context;
}
