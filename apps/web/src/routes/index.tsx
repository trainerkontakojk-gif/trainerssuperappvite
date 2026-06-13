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
          <div className="hero-left">
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
              {/* Mobile-only scroll hint — inline below CTA, hidden on desktop */}
              <div className="hero-scroll-mobile">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                Scroll untuk lihat lebih
              </div>
            </div>
          </div>
          
          <div className="hero-right hero-stack">
            <div className="stack-card card-ketik">
              <div className="sc-header">
                <span className="sc-dot" style={{background: '#3B82F6'}}></span>
                <span className="sc-title">KETIK Session</span>
              </div>
              <div className="sc-body">
                <div className="sc-chat-bubble incoming">Selamat siang, saya ingin melaporkan petugas penagih yang mengancam saya.</div>
                <div className="sc-chat-bubble outgoing typing">
                  <span className="sc-dot-typing"></span><span className="sc-dot-typing"></span><span className="sc-dot-typing"></span>
                </div>
              </div>
            </div>
            
            <div className="stack-card card-pdkt">
               <div className="sc-header">
                <span className="sc-dot" style={{background: '#A855F7'}}></span>
                <span className="sc-title">PDKT Draft</span>
              </div>
              <div className="sc-body sc-body-email">
                <div className="sc-email-wrapper">
                  <div className="sc-email-header">
                    <div className="sc-email-field"><span className="sc-email-label">To:</span> konsumen@gmail.com</div>
                    <div className="sc-email-field"><span className="sc-email-label">Sub:</span> Tindak Lanjut Konsumen #L1234</div>
                  </div>
                  <div className="sc-email-content">
                    <p className="sc-email-text">Yth. Bapak/Ibu Konsumen,</p>
                    <p className="sc-email-text">Sesuai dengan kewenangan dan tugasnya, OJK mengawasi Lembaga Jasa Keuangan (LJK) di sektor perbankan, pasar modal, lembaga keuangan non bank (seperti: asuransi, dana pensiun, perusahaan pembiayaan, dll).</p>
                    <p className="sc-email-text dim">Hormat kami, Tim Layanan</p>
                  </div>
                  <div className="sc-email-footer">
                    <div className="sc-email-btn-send">Kirim</div>
                  </div>
                </div>
                <div className="sc-email-success">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                  <span>Draft Terkirim!</span>
                </div>
              </div>
            </div>
            
            <div className="stack-card card-telefun">
               <div className="sc-header">
                <span className="sc-dot" style={{background: '#10B981'}}></span>
                <span className="sc-title">TELEFUN Call</span>
              </div>
              <div className="sc-body sc-body-call">
                {/* Incoming Call State */}
                <div className="sc-call-incoming-state">
                  <div className="sc-call-avatar incoming-pulse">
                     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  </div>
                  <div className="sc-call-name">Konsumen</div>
                  <div className="sc-call-status">Panggilan Masuk...</div>
                  <div className="sc-call-actions-incoming">
                    <div className="sc-call-btn accept">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                    </div>
                    <div className="sc-call-btn decline">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="22" y1="2" x2="2" y2="22"></line></svg>
                    </div>
                  </div>
                </div>

                {/* Active Call State */}
                <div className="sc-call-active-state">
                  <div className="sc-call-avatar active-pulse">
                     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  </div>
                  <div className="sc-call-name">Konsumen</div>
                  <div className="sc-call-time">02:45 <span>•</span> Live</div>
                  <div className="sc-call-actions-active">
                    <div className="sc-call-btn mute">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
                    </div>
                    <div className="sc-call-btn end">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="22" y1="2" x2="2" y2="22"></line></svg>
                    </div>
                  </div>
                </div>
              </div>
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
