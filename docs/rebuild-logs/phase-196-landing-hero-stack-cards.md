# Phase 196: Landing Page Hero Stack Cards

## Ringkasan

Menambahkan hero stack cards interaktif di landing page — preview visual module KETIK (chat bubble), PDKT (email draft), dan TELEFUN (call interface) yang tersusun bertumpuk dengan efek hover dan animasi.

## Perubahan

### apps/web/src/routes/index.tsx
- Hero section dibagi menjadi dua kolom: `hero-left` (text) dan `hero-right` (stack cards)
- Layout flex dengan `justify-content: space-between` dan gap 60px
- `hero-bottom` diubah dari `flex-wrap` menjadi `flex-column` dengan margin-top 24px

### apps/web/src/routes/landing.css
- **`.hero-in`** — Flex layout row dengan space-between + gap 60px
- **`.hero-left`** — Flex 1, max-width 760px untuk konten text
- **`.hero-stack`** — Container 400x580px dengan perspective 1000px, absolute positioning untuk cards
- **`.stack-card`** — Glassmorphism card (backdrop-blur, color-mix background), 320x200px, border 16px radius
- **3 cards** — Posisi absolute dengan z-index dan rotasi berbeda:
  - `card-ketik` — z-index 3, rotate(-2deg), chat bubbles dengan typing animation
  - `card-pdkt` — z-index 2, rotate(3deg), email header + body dengan subject/body
  - `card-telefun` — z-index 1, rotate(-1deg), avatar + name + call actions dengan red end button
- **Hover effect** — `.hero-stack:hover` memperbesar offset rotasi dan translasi cards
- **Dark mode** — Box shadow dan background transparency berbeda
- **Responsive mobile** — Flex column, cards center dengan transform translateX

### Phase 196 Enhancement — Animated State Transitions

#### PDKT Card: Email Sending Animation
- Email wrapper (`sc-email-wrapper`) dengan animasi `emailSendWrapper` (visible 0-75%, slide out at 80%, reset at 90%)
- Send button (`sc-email-btn-send`) dengan animasi `sendBtnPulse` (click effect at ~75% mark)
- Success state (`sc-email-success`) dengan checkmark SVG + "Draft Terkirim!" caption, muncul di 82-90% siklus
- Email content font size 9px, lebih compact; footer dengan Kirim button di right

#### TELEFUN Card: Call State Machine
- **Incoming Call State** (`sc-call-incoming-state`): Avatar dengan `ringVibrate` animation (rotate ±6°), "Panggilan Masuk..." status dengan green blink, accept (green pulse) dan decline (red) buttons. Visible 0-36% siklus.
- **Active Call State** (`sc-call-active-state`): Avatar dengan `active-pulse`, call timer "02:45 • Live", mute button + end call (red) buttons. Visible 46-80% siklus.
- Transisi smooth: incoming fade out 36-42%, active fade in 42-46%
- `acceptPulseCall` animation: scale + box-shadow glow before auto-answer

#### CSS Animation Timing (10s loop per card)
| State | Timing | Effect |
|-------|--------|--------|
| KETIK Incoming | 0-8% | Fade in + slide |
| KETIK Visible | 14-80% | Chat bubble visible |
| KETIK Typing | 36-80% | Typing dots appear |
| KETIK Fade out | 90-100% | Fade out |
| PDKT Draft | 0-75% | Email visible |
| PDKT Send click | 74% | Button press scale |
| PDKT Success | 82-90% | "Draft Terkirim!" |
| PDKT Reset | 94-100% | Reset to draft |
| TELEFUN Incoming | 0-36% | Ringing + accept/decline |
| TELEFUN Accept | 36% | Accept button pulse |
| TELEFUN Active | 46-80% | Live call + mute/end |
| TELEFUN End | 90-100% | Fade out |

#### Layout Adjustments
- Hero stack container: 400×580px → 400×620px (taller for extra content)
- Stack card: 320×200px → 320×220px (taller)
- Card padding: 20px → 16px 20px (tighter vertical)
- Card positions adjusted (pdkt Y: 190→195, telefun Y: 370→385)

## Verifikasi

- `pnpm --filter @trainers/web lint`
- `pnpm --filter @trainers/web build`
- Preview cards muncul di desktop (side-by-side) dan mobile (stacked)
- Hover animation memperbesar offset cards
- Dark mode rendering konsisten
- PDKT email send animation loop berjalan mulus
- TELEFUN incoming call → active call transisi smooth
