# PDKT System Prompt Remediation

## Tujuan

Remediasi ini menutup trust-boundary, output validation, scoring, prompt-budget, content-policy, dan default-model findings pada audit sistem prompt PDKT tanpa mengubah kontrak Single-Turn, recipient routing, attachment, histori lama, atau AI usage logging.

## Perubahan

### Prompt boundary dan budget

- Data dinamis generasi dan evaluasi diserialisasi serta di-escape (`<`, `>`, `&`, U+2028, dan U+2029) di dalam blok berlabel data-only. Scenario, persona konsumen, identity, recipient metadata, inbound body, agent reply, dan revision requirements tidak lagi diinterpolasi sebagai instruksi.
- Prompt memiliki hard ceiling 100.000 karakter. Aplikasi memakai budget efektif 99.488 karakter dengan reserve 512 karakter untuk adapter provider; compaction hanya memotong nilai data dinamis dan mempertahankan instruksi serta format output.
- Prompt-specific limits diterapkan pada route generate template, session init/create, evaluate, mailbox batch, dan mailbox reply. Attachment/base64 tidak dimasukkan ke data prompt, sedangkan schema attachment dan persisted snapshot legacy tetap tidak dibatasi oleh kontrak prompt baru.

### Output, scoring, dan kompatibilitas

- Output AI template, initial email, dan evaluation wajib lolos strict Zod schema. Wrong-shape JSON ditolak dengan pesan yang manusiawi.
- Evaluation AI wajib mengembalikan lima dimensi score breakdown. Backend mengabaikan aggregate score model sebagai sumber final, lalu menghitung `round(sum(lima dimensi) / 5)` dan menerapkan recipient conflict cap sesudahnya.
- Catatan cap ditambahkan ke feedback hanya bila cap benar-benar mengubah score atau `recipientDirectionScore`.
- `scoreBreakdown` pada hasil/history lama tetap opsional sehingga data lama masih dapat dibaca.

### Generation policy dan model

- Stable consumer ID `terburu-buru` memakai 250-500 kata dan 3-5 paragraf. Consumer lain memakai 500-1.000 kata dan 5-8 paragraf. Prompt awal, retry, dan final validation memakai policy yang sama.
- Persona generasi membawa `consumerType.id`, `name`, `description`, `tone`, dan `difficulty` sebagai data terstruktur.
- Seluruh fallback runtime PDKT memakai `DEFAULT_AI_MODEL_ID` dari model registry kanonikal. Jalur dan konteks AI usage logging tidak berubah.

## Focused TDD Evidence

Implementasi dikerjakan secara RED-GREEN dan dilaporkan dengan bukti berikut:

| Scope | RED | GREEN/final |
| --- | --- | --- |
| Prompt contract foundation | 4/4 gagal sesuai ekspektasi; helper follow-up 4 gagal | 8/8, lalu review-fix 13/13 |
| Evaluation | 7 gagal, 9 lulus | 16/16; foundation + evaluation 29/29 |
| Generation | 7 gagal sesuai ekspektasi | 71/71 |
| Cross-scope review fix | 6 gagal dari 102 | 102/102 |
| Mailbox ingress | 2 gagal dari 19 | 19/19; final evaluation/mailbox suite 49/49 |

Command fokus yang digunakan:

```bash
pnpm --filter @trainers/api exec vitest run src/__tests__/pdkt-prompt-contract.test.ts
pnpm --dir apps/api exec vitest run src/__tests__/pdkt-evaluation-prompt.test.ts src/__tests__/pdkt-evaluate-route.test.ts
pnpm --dir apps/api exec vitest run src/__tests__/pdkt-prompt-contract.test.ts src/__tests__/pdkt-email-policy.test.ts src/__tests__/pdkt-session-service.test.ts src/__tests__/pdkt-session-create-route.test.ts src/__tests__/pdkt-evaluation-prompt.test.ts --reporter=dot
pnpm --dir apps/api exec vitest run src/__tests__/pdkt-mailbox-batch-route.test.ts src/__tests__/pdkt-reply-route.test.ts src/__tests__/pdkt-evaluate-route.test.ts src/__tests__/pdkt-evaluation-prompt.test.ts src/__tests__/pdkt-prompt-contract.test.ts
```

## Final Verification

- Full focused PDKT suite dari `apps/api` melalui `pnpm exec vitest run src/__tests__/pdkt*.test.ts`: **16 file / 192 test lulus**.
- Root `pnpm build`: **exit 0** (API dan Telefun TypeScript check serta web production build lulus).
- Root `pnpm test:core`: **exit 0** (API 134, web 56, dan Telefun 231 test lulus).
- Scoped ESLint untuk file yang berubah: **exit 0**.
- Root `pnpm lint`: **exit 1** karena lima error baseline pada file yang tidak disentuh oleh remediation ini: empat `prefer-const` di `apps/api/src/__tests__/telefun-communication-profile.test.ts` dan satu `no-useless-assignment` di `apps/api/src/services/ketik/prompt-policy.ts`; lint juga melaporkan tujuh warning. Sesuai pre-push gate, hasil ini dicatat sebagai blocker dan tidak diklaim lulus.
- Mandatory Thermo Nuclear Code Quality Review: **APPROVE**, tanpa finding material tersisa.
- Tidak ada commit atau push yang dilakukan.
