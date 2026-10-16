import { Navigate, useSearch } from "@tanstack/react-router";
import LeaderAccessGate from "../../components/LeaderAccessGate";

/**
 * `/sidak` tidak punya halaman sendiri: route ini membuka Dashboard dengan
 * cakupan dari query (`layanan`, `tahun`, `dari`, `sampai`, `tim`). Gerbang
 * akses tetap di sini, karena leader yang belum disetujui dialihkan ke
 * `/sidak` oleh route guard; tanpa gerbang itu terjadi pengalihan berulang.
 */
export default function SidakIndexRedirect() {
  const search = useSearch({ from: "/sidak" });
  return (
    <LeaderAccessGate module="sidak" moduleLabel="SIDAK">
      <Navigate to="/sidak/dashboard" search={search} replace />
    </LeaderAccessGate>
  );
}
