/**
 * audit-root-cause-fixture.mjs
 * =============================
 * In-memory qa_temuan rows for `audit-root-cause-coverage.mjs --dry-run`.
 * No Supabase connection; covers matched, fallback, phantom and weak-evidence
 * rows, plus a Call "menit" timestamp row for --sample-texts.
 */

export function getDryRunFixture() {
  return [
    // Should match clusters
    {
      id: "dr-01",
      nilai: 0,
      service_type: "call",
      period_id: "p1",
      indicator_name: "Akurasi Jawaban",
      ketidaksesuaian:
        "Salah nama perusahaan pada respons, menyebut Bank ABC bukan Bank XYZ",
      sebaiknya: "Pastikan nama perusahaan sesuai dengan data di sistem",
    },
    {
      id: "dr-02",
      nilai: 1,
      service_type: "call",
      period_id: "p1",
      indicator_name: "Menggali Kebutuhan",
      ketidaksesuaian: "Agent tidak bertanya mengenai kronologi kejadian",
      sebaiknya: "Sebaiknya agent menggali lebih dalam kronologi",
    },
    {
      id: "dr-03",
      nilai: 0,
      service_type: "chat",
      period_id: "p1",
      indicator_name: "Verifikasi Data",
      ketidaksesuaian: "Tidak melakukan verifikasi data identitas nasabah",
      sebaiknya: "Lakukan verifikasi data nasabah sebelum melanjutkan",
    },
    {
      id: "dr-04",
      nilai: 2,
      service_type: "call",
      period_id: "p2",
      indicator_name: "Kepatuhan SJ",
      ketidaksesuaian: "Jawaban tidak sesuai standar jawaban yang berlaku",
      sebaiknya: "Gunakan standar jawaban yang sudah ditetapkan",
    },
    {
      id: "dr-05",
      nilai: 1,
      service_type: "email",
      period_id: "p2",
      indicator_name: "Akurasi Informasi",
      ketidaksesuaian:
        "Informasi suku bunga tidak akurat, menyebut 5% padahal 4.5%",
      sebaiknya: "Pastikan informasi yang diberikan sesuai ketentuan terbaru",
    },
    {
      id: "dr-06",
      nilai: 0,
      service_type: "call",
      period_id: "p1",
      indicator_name: "Probing",
      ketidaksesuaian: "Kurang menggali kebutuhan nasabah secara detail",
      sebaiknya: "Tanyakan tujuan nasabah secara lengkap",
    },
    {
      id: "dr-06b",
      nilai: 1,
      service_type: "bko",
      period_id: "p1",
      indicator_name: "Dokumentasi APPK",
      ketidaksesuaian:
        "Agent tidak sesuai dalam memilih data kontak pada APPK.",
      sebaiknya: "Pilih data kontak yang benar di APPK",
    },
    // Should fall back to lainnya
    {
      id: "dr-07",
      nilai: 1,
      service_type: "chat",
      period_id: "p1",
      indicator_name: "Etika Komunikasi",
      ketidaksesuaian: "Penggunaan bahasa kurang formal dan terlalu santai",
      sebaiknya: "Gunakan bahasa yang lebih profesional",
    },
    {
      id: "dr-08",
      nilai: 2,
      service_type: "call",
      period_id: "p2",
      indicator_name: "Penanganan Keberatan",
      ketidaksesuaian: "Respon terhadap keberatan nasabah kurang empati",
      sebaiknya: null,
    },
    {
      id: "dr-09",
      nilai: 3,
      service_type: "email",
      period_id: "p2",
      indicator_name: "Tata Bahasa",
      ketidaksesuaian: "Terdapat beberapa typo pada kalimat",
      sebaiknya: "Periksa kembali ejaan sebelum mengirim email",
    },
    // nilai=3 with evidence that could match a cluster
    {
      id: "dr-10",
      nilai: 3,
      service_type: "call",
      period_id: "p1",
      indicator_name: "Verifikasi Data",
      ketidaksesuaian: "Sebaiknya melakukan verifikasi data lebih teliti",
      sebaiknya: "Verifikasi data nasabah sebelum closing",
    },
    // Multiple clusters match — best-match tie uses priority
    {
      id: "dr-11",
      nilai: 0,
      service_type: "call",
      period_id: "p1",
      indicator_name: "Akurasi Jawaban",
      ketidaksesuaian: "Salah jawaban dan nama perusahaan juga salah",
      sebaiknya: null,
    },
    // Phantom padding — should be excluded
    {
      id: "dr-12",
      nilai: 3,
      service_type: "call",
      period_id: "p1",
      indicator_name: "Sesi Tanpa Temuan",
      ketidaksesuaian: null,
      sebaiknya: null,
      is_phantom_padding: true,
    },
    // Weak evidence — no text at all
    {
      id: "dr-13",
      nilai: 1,
      service_type: "call",
      period_id: "p1",
      indicator_name: "Parameter Tidak Dikenal",
      ketidaksesuaian: null,
      sebaiknya: null,
    },
    // Additional fallback patterns for phrase extraction
    {
      id: "dr-14",
      nilai: 1,
      service_type: "chat",
      period_id: "p1",
      indicator_name: "Respon Cepat",
      ketidaksesuaian:
        "Waktu respons terlalu lama, melebihi SLA yang ditentukan",
      sebaiknya: "Perhatikan waktu respons agar sesuai SLA",
    },
    {
      id: "dr-15",
      nilai: 0,
      service_type: "bko",
      period_id: "p1",
      indicator_name: "Dokumentasi",
      ketidaksesuaian: "Dokumentasi tidak lengkap, beberapa field tidak diisi",
      sebaiknya: "Lengkapi semua field dokumentasi",
    },
    {
      id: "dr-16",
      nilai: 1,
      service_type: "slik",
      period_id: "p1",
      indicator_name: "Ketepatan Data",
      ketidaksesuaian:
        "Data debitur tidak sesuai dengan SLIK, terdapat perbedaan nomor identitas",
      sebaiknya: null,
    },
    {
      id: "dr-17",
      nilai: 2,
      service_type: "call",
      period_id: "p2",
      indicator_name: "Penutupan",
      ketidaksesuaian:
        "Tidak melakukan konfirmasi ulang data sebelum menutup interaksi",
      sebaiknya: null,
    },
    // Hard-to-classify pattern
    {
      id: "dr-18",
      nilai: 1,
      service_type: "email",
      period_id: "p2",
      indicator_name: "Lampiran",
      ketidaksesuaian: "Lampiran tidak sesuai dengan isi email",
      sebaiknya: "Pastikan lampiran sesuai dengan konten email",
    },
    // Non-HOLD duration — exercises the --sample-texts Call "menit" group
    {
      id: "dr-18b",
      nilai: 2,
      service_type: "call",
      period_id: "p2",
      indicator_name: "Penutupan",
      ketidaksesuaian:
        "Agent menjanjikan callback dalam 30 menit namun tidak dilakukan",
      sebaiknya: null,
    },
    {
      id: "dr-19",
      nilai: 0,
      service_type: "call",
      period_id: "p1",
      indicator_name: "Identifikasi",
      ketidaksesuaian:
        "Tidak melakukan verifikasi identitas penelepon sama sekali",
      sebaiknya: null,
    },
  ];
}
