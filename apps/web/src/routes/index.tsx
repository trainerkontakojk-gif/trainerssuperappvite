import { Suspense, useContext } from "react";
import { Link } from "@tanstack/react-router";
import { LandingAuthProvider, AuthContext } from "../components/LandingAuthClient";
import { useThemeMode } from "../hooks/useThemeMode";
import "./landing.css";

function LandingContent() {
  const { isCheckingAuth, isLoggedIn, openAuth } = useContext(AuthContext);
  const { theme, setTheme } = useThemeMode();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="landing-wrapper">
      <nav className="nav">
        <div className="nav-in">
          <div className="nav-left">
            <div className="n-logo">S</div>
            <span className="n-name">Trainers SuperApp</span>
          </div>
          <div className="nav-right">
            {isCheckingAuth ? null : isLoggedIn ? (
              <Link to="/dashboard" className="nb nb-s">Dashboard</Link>
            ) : (
              <>
                <button className="nb nb-g" onClick={() => openAuth('login')}>Masuk</button>
                <button className="nb nb-s" onClick={() => openAuth('register')}>Ajukan Akses</button>
              </>
            )}
            <button className="nb-t" onClick={toggleTheme}>
              {theme === "dark" ? "☀️" : "◐"}
            </button>
          </div>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-in">
          <div className="hero-massive">
            <span>TRAINERS</span>
            <span className="outlined">SUPER</span>
            <span>APP.</span>
          </div>
          <div className="hero-bottom">
            <p className="hero-desc">
              Platform terpusat untuk simulasi, profiling, dan analitik — dibangun khusus untuk tim trainer agar bekerja lebih cepat dan tepat sasaran.
            </p>
            <div className="hero-cta">
              {isCheckingAuth ? null : isLoggedIn ? (
                <Link to="/dashboard" className="hb hb-p">Buka Dashboard →</Link>
              ) : (
                <>
                  <button className="hb hb-p" onClick={() => openAuth('login')}>Masuk ke Platform →</button>
                  <button className="hb hb-o" onClick={() => openAuth('register')}>Minta Akses</button>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="hero-scroll">
          <div className="hero-scroll-line"></div>
          Scroll
        </div>
      </section>

      <div className="marquee-wrap">
        <div className="marquee-track">
          {[...Array(2)].map((_, i) => (
            <div key={i} style={{ display: 'contents' }}>
              <div className="marquee-item"><span className="mq-dot" style={{background:'#3B82F6'}}></span><span className="mq-name">KETIK</span></div>
              <span className="mq-sep">/</span>
              <div className="marquee-item"><span className="mq-dot" style={{background:'#A855F7'}}></span><span className="mq-name">PDKT</span></div>
              <span className="mq-sep">/</span>
              <div className="marquee-item"><span className="mq-dot" style={{background:'#10B981'}}></span><span className="mq-name">TELEFUN</span></div>
              <span className="mq-sep">/</span>
              <div className="marquee-item"><span className="mq-dot" style={{background:'#8B5CF6'}}></span><span className="mq-name">KTP</span></div>
              <span className="mq-sep">/</span>
              <div className="marquee-item"><span className="mq-dot" style={{background:'#F43F5E'}}></span><span className="mq-name">SIDAK</span></div>
              <span className="mq-sep">/</span>
            </div>
          ))}
        </div>
      </div>

      <section className="mods">
        <div className="mods-head">
          <h2 className="mods-title">Lima modul. Satu pengalaman.</h2>
          <p className="mods-sub">Setiap modul punya identitas, tapi berbagi satu desain sistem — perpindahan tanpa kurva belajar baru.</p>
        </div>

        <div className="mod-row" data-m="ketik">
          <div className="mod-left">
            <div className="mod-bar"></div>
            <div>
              <div className="mod-id">KETIK</div>
              <div className="mod-full">Kelas Etika &amp; Trik Komunikasi</div>
            </div>
          </div>
          <div className="mod-right">
            <p className="mod-desc">Simulasi chat pelanggan dengan skenario realistis dan feedback AI real-time. Latih komunikasi tertulis yang empatik dan solutif.</p>
            <span className="mod-arrow">→</span>
          </div>
        </div>

        <div className="mod-row" data-m="pdkt">
          <div className="mod-left">
            <div className="mod-bar"></div>
            <div>
              <div className="mod-id">PDKT</div>
              <div className="mod-full">Paham Dulu Kasih Tanggapan</div>
            </div>
          </div>
          <div className="mod-right">
            <p className="mod-desc">Workspace korespondensi email dengan draf terpandu dan asisten AI untuk standardisasi tanggapan layanan.</p>
            <span className="mod-arrow">→</span>
          </div>
        </div>

        <div className="mod-row" data-m="telefun">
          <div className="mod-left">
            <div className="mod-bar"></div>
            <div>
              <div className="mod-id">TELEFUN</div>
              <div className="mod-full">Telephone Fun</div>
            </div>
          </div>
          <div className="mod-right">
            <p className="mod-desc">Skenario telepon berbasis kasus nyata di lapangan, dilengkapi voice assessment dan analisis profil komunikasi.</p>
            <span className="mod-arrow">→</span>
          </div>
        </div>

        <div className="mod-row" data-m="ktp">
          <div className="mod-left">
            <div className="mod-bar"></div>
            <div>
              <div className="mod-id">KTP</div>
              <div className="mod-full">Kotak Tool Profil</div>
            </div>
          </div>
          <div className="mod-right">
            <p className="mod-desc">Database profil agen dan peserta — kelola data training secara terstruktur dengan export dan slide otomatis.</p>
            <span className="mod-arrow">→</span>
          </div>
        </div>

        <div className="mod-row" data-m="sidak">
          <div className="mod-left">
            <div className="mod-bar"></div>
            <div>
              <div className="mod-id">SIDAK</div>
              <div className="mod-full">Sistem Informasi Data Analisis Kualitas</div>
            </div>
          </div>
          <div className="mod-right">
            <p className="mod-desc">Analytics kualitas layanan — ranking agen, pola temuan, laporan AI, dan identifikasi area perbaikan lintas tim.</p>
            <span className="mod-arrow">→</span>
          </div>
        </div>
      </section>

      <section className="statement">
        <p className="statement-text">
          <span className="dim">Kami membangun ini karena</span> tim trainer tidak seharusnya menghabiskan waktu untuk berpindah antar lima alat berbeda. <span className="dim">Cukup satu tempat — sisanya biar platform yang bekerja.</span>
        </p>
      </section>

      <section className="cta">
        <div className="cta-in">
          <div className="cta-text">
            <h2 className="cta-h">Siap mulai?</h2>
            <p className="cta-p">Sederhanakan alur pelatihan tim Anda. Satu platform, satu login, semua modul.</p>
          </div>
          <div className="cta-btns">
            {isCheckingAuth ? null : isLoggedIn ? (
              <Link to="/dashboard" className="cb cb-p">Buka Dashboard →</Link>
            ) : (
              <>
                <button className="cb cb-p" onClick={() => openAuth('login')}>Masuk ke Platform →</button>
                <button className="cb cb-o" onClick={() => openAuth('register')}>Minta Akses</button>
              </>
            )}
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-in">
          <div className="f-left">
            <div className="f-logo">S</div>
            <span className="f-copy">© 2026 Trainers SuperApp</span>
          </div>
          <div className="f-links">
            <a href="#">KETIK</a>
            <a href="#">PDKT</a>
            <a href="#">TELEFUN</a>
            <a href="#">KTP</a>
            <a href="#">SIDAK</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function IndexPage() {
  return (
    <Suspense fallback={null}>
      <LandingAuthProvider>
        <LandingContent />
      </LandingAuthProvider>
    </Suspense>
  );
}
