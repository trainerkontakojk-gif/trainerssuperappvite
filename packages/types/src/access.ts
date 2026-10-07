/** Application roles. Participant jobs and transcript speakers are separate domains. */
export const ROLES = ["admin", "trainer", "leader", "agent"] as const;
export type Role = (typeof ROLES)[number];

/** Canonical roles only; aliases were retired after clean local/remote audits. */
export function normalizeRole(raw: string | null | undefined): Role | null {
  const value = raw?.trim().toLowerCase();
  return ROLES.find((role) => role === value) ?? null;
}

/** Approved access matrix: resource permissions, independent of row ownership. */
export const CAPABILITIES = {
  "account.accessStatus.read": ["admin", "trainer", "leader", "agent"],
  "account.read": ["admin", "trainer", "leader", "agent"],
  "account.sessions.revoke": ["admin", "trainer", "leader", "agent"],
  "admin.accessGroups": ["admin", "trainer"],
  "admin.activityLogs.read": ["admin", "trainer"],
  "admin.leaderAccess": ["admin", "trainer"],
  "admin.users": ["admin", "trainer"],
  "admin.users.manageAdmin": ["admin"],
  "ai.generate": ["admin", "trainer"],
  "ai.models.read": ["admin", "trainer", "leader", "agent"],
  "dashboard.view": ["admin", "trainer", "leader", "agent"],
  "ketik.history.delete": ["admin", "trainer", "leader", "agent"],
  "ketik.history.read": ["admin", "trainer", "leader", "agent"],
  "ketik.history.write": ["admin", "trainer", "leader", "agent"],
  "ketik.landing": ["admin", "trainer", "leader", "agent"],
  "ketik.review": ["admin", "trainer"],
  "ketik.review.read": ["admin", "trainer", "leader", "agent"],
  "ketik.settings.read": ["admin", "trainer", "leader", "agent"],
  "ketik.settings.write": ["admin", "trainer", "leader", "agent"],
  "ketik.templates.shared.write": ["admin"],
  "ketik.use": ["admin", "trainer", "leader", "agent"],
  "ketik.worker.process": ["admin", "trainer"],
  "monitoring.billing.read": ["admin", "trainer"],
  "monitoring.billing.write": ["admin", "trainer"],
  "monitoring.history.delete": ["admin", "trainer"],
  "monitoring.pricing.read": ["admin", "trainer"],
  "monitoring.pricing.write": ["admin", "trainer"],
  "monitoring.read": ["admin", "trainer", "leader"],
  "monitoring.recording.sign": ["admin", "trainer"],
  "pdkt.evaluate": ["admin", "trainer", "leader"],
  "pdkt.history.delete": ["admin", "trainer", "leader", "agent"],
  "pdkt.history.read": ["admin", "trainer", "leader", "agent"],
  "pdkt.history.retry": ["admin", "trainer", "leader", "agent"],
  "pdkt.mailbox.create": ["admin", "trainer", "leader", "agent"],
  "pdkt.mailbox.delete": ["admin", "trainer", "leader", "agent"],
  "pdkt.mailbox.manageAll": ["admin", "trainer"],
  "pdkt.mailbox.read": ["admin", "trainer", "leader", "agent"],
  "pdkt.mailbox.reply": ["admin", "trainer", "leader", "agent"],
  "pdkt.settings.read": ["admin", "trainer", "leader", "agent"],
  "pdkt.settings.write": ["admin", "trainer", "leader", "agent"],
  "pdkt.templates.generate": ["admin", "trainer", "leader"],
  "pdkt.use": ["admin", "trainer", "leader", "agent"],
  "participants.readAll": ["admin", "trainer"],
  "profiler.landing": ["admin", "trainer", "leader"],
  "profiler.read": ["admin", "trainer", "leader"],
  "profiler.view": ["admin", "trainer", "leader"],
  "profiler.write": ["admin", "trainer"],
  "sidak.archives.delete": ["admin", "trainer", "leader", "agent"],
  "sidak.archives.manageAll": ["admin", "trainer"],
  "sidak.archives.read": ["admin", "trainer", "leader", "agent"],
  "sidak.config.manage": ["admin", "trainer"],
  "sidak.config.read": ["admin", "trainer", "leader"],
  "sidak.dashboard.read": ["admin", "trainer", "leader", "agent"],
  "sidak.forecast.generate": ["admin", "trainer", "leader"],
  "sidak.landing": ["admin", "trainer", "leader"],
  "sidak.read": ["admin", "trainer", "leader"],
  "sidak.reports.generate": ["admin", "trainer", "leader"],
  "sidak.reports.view": ["admin", "trainer"],
  "sidak.schedule.read": ["admin", "trainer"],
  "sidak.summary.refresh": ["admin", "trainer"],
  "sidak.view": ["admin", "trainer", "leader"],
  "sidak.write": ["admin", "trainer"],
  "simulation.subject.select": ["admin", "trainer"],
  "telefun.cleanup": ["admin", "trainer"],
  "telefun.landing": ["admin", "trainer", "leader", "agent"],
  "telefun.manage": ["admin", "trainer"],
  "telefun.recording.read": ["admin", "trainer"],
  "telefun.use": ["admin", "trainer"],
  "usage.read": ["admin", "trainer", "leader", "agent"],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;
export function can(
  role: Role | null | undefined,
  capability: Capability,
): boolean {
  return (
    role != null && (CAPABILITIES[capability] as readonly Role[]).includes(role)
  );
}

// Approval guards protect UI views; backend participant access uses data scope.
export const LEADER_APPROVAL_MODULE: Partial<
  Record<Capability, "ktp" | "sidak">
> = {
  "profiler.view": "ktp",
  "sidak.view": "sidak",
};
