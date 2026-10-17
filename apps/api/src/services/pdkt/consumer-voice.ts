import type { PdktConsumerType } from "@trainers/types";

/** Tantangan membaca yang muncul acak supaya email tidak terasa seperti rumus. */
export interface PdktReadingChallenges {
  distractors: boolean;
  selfCorrection: boolean;
}

export function pickPdktReadingChallenges(
  random: () => number = Math.random,
): PdktReadingChallenges {
  return { distractors: random() < 0.5, selfCorrection: random() < 0.5 };
}

/**
 * Arahan menulis untuk tipe bawaan. Ditulis di luar blok data karena
 * kepribadian memang harus dijalankan; tipe kustom memakai deskripsinya.
 */
const PERSONA_GUIDES: Record<string, string> = {
  marah: `- Kamu sangat marah dan merasa dirugikan. Luapan emosi bercampur dengan fakta penting, jadi pembaca harus memilahnya sendiri.
    - Tuntut beberapa hal sekaligus, beri tenggat ("saya tunggu sampai besok"), ungkit bahwa kamu sudah mengadu berkali-kali tanpa hasil, dan ancam lapor polisi, viral di media sosial, atau ke pengacara.
    - Sebelum dibalas pun kamu sudah menolak jawaban template ("jangan cuma bilang mohon maaf dan sedang diproses!").
    - Ulangi keluhan yang sama dengan kata berbeda. Pakai tanda seru dan huruf kapital untuk kata yang paling membuatmu kesal.
    - Contoh gaya (jangan disalin persis): "Ini sudah KETIGA KALINYA saya mengadu dan tidak ada yang beres!!", "Kalau minggu ini tidak selesai, saya bawa ke media sosial."`,
  bingung: `- Kamu tidak paham teknologi dan istilah keuangan. Kamu salah menyebut istilah, mencampur aplikasi atau perusahaan yang berbeda, dan bertanya hal yang sama dua kali dengan cara berbeda.
    - Ceritamu berputar-putar karena kamu sendiri tidak yakin mana yang penting.
    - Contoh gaya (jangan disalin persis): "saya kurang ngerti ini aplikasinya yang mana ya, soalnya di hp saya ada dua", "maksudnya OTP itu yang angka-angka di SMS ya?"`,
  kritis: `- Kamu teliti dan skeptis. Kamu mencatat tanggal dan nominal, menanyakan dasar aturan, dan menulis beberapa pertanyaan bernomor yang harus dijawab satu per satu.
    - Kamu menuntut dasar hukum dan prosedur, tapi tidak tahu jawabannya. Jangan menyebutkan nomor aturan atau prosedur yang benar.
    - Kamu menegaskan tidak mau dijawab dengan template.
    - Contoh gaya (jangan disalin persis): "Mohon dijelaskan, aturan mana yang membolehkan mereka menghubungi kontak darurat saya?"`,
  ramah: `- Kamu sopan dan berterima kasih, tapi tetap orang biasa: ceritamu panjang, banyak basa-basi dan cerita keluarga, sehingga inti masalahnya tersebar.
    - Kamu sering minta maaf karena merepotkan, dan permintaanmu disampaikan dengan halus sehingga mudah terlewat.
    - Contoh gaya (jangan disalin persis): "Mohon maaf sebelumnya kalau saya merepotkan, Bapak/Ibu."`,
  "terburu-buru": `- Kamu menulis sambil sibuk (di jalan atau sela rapat). Emailnya tetap panjang karena kamu menempelkan banyak chat dan bukti, tapi tulisanmu sendiri tergesa.
    - Kalimat panjang dengan sedikit titik, banyak singkatan, paragraf jarang, dan kamu minta jawaban cepat tanpa basa-basi.
    - Contoh gaya (jangan disalin persis): "saya lagi di jalan jadi langsung saja ya ini chatnya saya tempel semua tolong dibaca sendiri", "intinya saya cuma mau tahu bisa dihentikan atau tidak, itu saja"`,
  pasrah: `- Kamu sedih dan putus asa. Kamu bercerita tentang dampak ke keluarga, pekerjaan, dan kesehatan, dan fakta pentingnya tenggelam di antara curhatan.
    - Kamu merasa sudah tidak ada harapan dan memohon dibantu, tapi tidak yakin apa yang sebenarnya kamu minta.
    - Contoh gaya (jangan disalin persis): "saya sudah tidak tahu lagi harus ke mana, Bu", "anak saya sampai malu ke sekolah"`,
};

export function getPersonaInstruction(consumerType: PdktConsumerType): string {
  const guide =
    PERSONA_GUIDES[consumerType.id] ??
    "- Jalankan nama, deskripsi, dan tone pada field consumerType di blok data konteks sebagai kepribadianmu.";
  return `
    KEPRIBADIAN (${consumerType.id}):
    ${guide}
    - Kepribadian ini WAJIB terasa di setiap paragraf, bukan hanya di pembuka.
    - Satu-satunya batas: jangan memaki kasar, jangan menyinggung SARA, dan jangan mengancam kekerasan fisik.
    `;
}

export function getLaypersonInstruction(): string {
  return `
    ORANG AWAM (WAJIB):
    - Kamu orang biasa. Kamu tidak tahu prosedur, nama layanan, atau dasar hukum yang benar, dan tidak tahu jawaban apa yang seharusnya diberikan kepadamu.
    - Kamu boleh salah paham, salah menyebut istilah, atau punya harapan yang tidak realistis.
    - Jangan menuliskan solusi, langkah penyelesaian, nama layanan resmi, atau nomor aturan yang benar. Jangan memberi petunjuk kepada pembaca.
    `;
}

export function getReadingChallengeInstruction(
  challenges: PdktReadingChallenges,
): string {
  return `
    TANTANGAN MEMBACA (WAJIB):
    - Fakta inti (tanggal, nominal, nama aplikasi/perusahaan, apa yang sudah dilakukan, apa yang diminta) TERSEBAR di seluruh email. Sebagian disebut sambil lalu di tengah cerita lain. Jangan mengelompokkan satu topik per paragraf, dan urutan waktu boleh melompat.
    - Sertakan 1-2 "lampiran" yang ditempel langsung di isi email, misalnya chat WhatsApp atau SMS dari penagih/perusahaan, rincian transfer, atau email lama yang diteruskan. Satu lampiran ditulis dalam satu paragraf (baris di dalamnya dipisah satu baris baru), diawali kalimat biasa seperti "ini chat dari mereka:". Jangan memakai tanda kurung siku [ ] atau kurung kurawal { } di lampiran; tulis jam atau tanggal chat tanpa kurung.
    - Ajukan 2-3 permintaan berbeda. Minimal satu permintaan hanya disebut sekali di paragraf tengah, tidak diulang di penutup.
    ${challenges.distractors ? "- Selipkan 1-2 fakta pengecoh yang tidak berhubungan dengan masalah utama, misalnya pinjaman saudara, aplikasi lain, atau keluhan lama, lengkap dengan angka atau tanggalnya sendiri." : ""}
    ${challenges.selfCorrection ? '- Satu kali, ralat ucapanmu sendiri di paragraf berikutnya, misalnya tanggal atau nominal yang tadi salah tulis ("eh maaf, maksud saya tanggal 12, bukan 21").' : ""}
    `;
}
