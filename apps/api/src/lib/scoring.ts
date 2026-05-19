import { ServiceType, ServiceWeight, QAIndicator, QAScore, ScoreDetail } from '@trainers/types';

export const VALID_SERVICE_TYPES: ServiceType[] = ['call', 'chat', 'email', 'cso', 'pencatatan', 'bko', 'slik'];

export function isServiceType(value: string | null | undefined): value is ServiceType {
  return typeof value === 'string' && VALID_SERVICE_TYPES.includes(value as ServiceType);
}

export const DEFAULT_SERVICE_WEIGHTS: Record<ServiceType, ServiceWeight> = {
  call:       { service_type: 'call',       critical_weight: 0.50, non_critical_weight: 0.50, scoring_mode: 'weighted' },
  chat:       { service_type: 'chat',       critical_weight: 0.50, non_critical_weight: 0.50, scoring_mode: 'weighted' },
  email:      { service_type: 'email',      critical_weight: 0.65, non_critical_weight: 0.35, scoring_mode: 'weighted' },
  cso:        { service_type: 'cso',        critical_weight: 0.50, non_critical_weight: 0.50, scoring_mode: 'weighted' },
  pencatatan: { service_type: 'pencatatan', critical_weight: 0.90, non_critical_weight: 0.10, scoring_mode: 'flat' },
  bko:        { service_type: 'bko',        critical_weight: 0.50, non_critical_weight: 0.50, scoring_mode: 'no_category' },
  slik:       { service_type: 'slik',       critical_weight: 0.60, non_critical_weight: 0.40, scoring_mode: 'weighted' },
};

export const SERVICE_LABELS: Record<ServiceType, string> = {
  call: 'Call',
  chat: 'Chat',
  email: 'Email',
  cso: 'CSO',
  pencatatan: 'Pencatatan',
  bko: 'BKO',
  slik: 'SLIK',
};

export const TIM_TO_DEFAULT_SERVICE: Record<string, ServiceType> = {
  'Telepon': 'call',
  'Chat': 'chat',
  'Email': 'email',
  'Mix': 'cso',
  'BKO': 'bko',
  'Tim BKO': 'bko',
  'SLIK': 'slik',
};

export function resolveServiceTypeFromTeam(team?: string | null): ServiceType {
  if (!team) return 'call';
  const raw: string = team.trim().toLowerCase();
  if (isServiceType(raw)) return raw;
  const ALIAS_MAP: Record<string, ServiceType> = {
    mix: 'cso', cso: 'cso', telepon: 'call', call: 'call',
    chat: 'chat', email: 'email', bko: 'bko', slik: 'slik', pencatatan: 'pencatatan',
  };
  for (const [alias, service] of Object.entries(ALIAS_MAP)) {
    if (raw.includes(alias)) return service;
  }
  for (const [key, value] of Object.entries(TIM_TO_DEFAULT_SERVICE)) {
    if (raw === key.trim().toLowerCase()) return value;
  }
  return 'call';
}

export function computeEffectiveService(
  serviceOverride: ServiceType | null | undefined,
  agentTim: string | null | undefined,
  fallbackService: ServiceType | null | undefined
): ServiceType {
  return serviceOverride ?? (agentTim ? resolveServiceTypeFromTeam(agentTim) : null) ?? fallbackService ?? 'call';
}

function scoreSession(
  indicators: QAIndicator[],
  temuan: { indicator_id: string; nilai: number }[],
  weight: ServiceWeight = DEFAULT_SERVICE_WEIGHTS['call']
): number {
  const getNilai = (ind: QAIndicator) => {
    const t = temuan.find(f => f.indicator_id === ind.id);
    return t ? t.nilai : 3;
  };

  if (weight.scoring_mode === 'flat' || weight.scoring_mode === 'no_category') {
    let totalB = 0, earnedB = 0;
    indicators.forEach(ind => {
      totalB  += ind.bobot;
      earnedB += (getNilai(ind) / 3) * ind.bobot;
    });
    return totalB === 0 ? 100 : (earnedB / totalB) * 100;
  }

  const calcCat = (cat: 'critical' | 'non_critical') => {
    const inds = indicators.filter(i => i.category === cat);
    let total = 0, earned = 0;
    inds.forEach(ind => {
      total  += ind.bobot;
      earned += (getNilai(ind) / 3) * ind.bobot;
    });
    return total === 0 ? 100 : (earned / total) * 100;
  };

  return calcCat('non_critical') * weight.non_critical_weight
       + calcCat('critical')     * weight.critical_weight;
}

export function calculateSessionScoreFromTemuan(
  indicators: QAIndicator[],
  temuan: { indicator_id: string; nilai: number }[],
  serviceWeight: ServiceWeight = DEFAULT_SERVICE_WEIGHTS['call']
): number {
  return scoreSession(indicators, temuan, serviceWeight);
}

export function calculateQAScoreFromTemuan(
  indicators: QAIndicator[],
  temuan: { indicator_id: string; nilai: number; no_tiket?: string | null; created_at?: string; period_id?: string }[],
  serviceWeight?: ServiceWeight
): QAScore {
  const weight = serviceWeight ?? DEFAULT_SERVICE_WEIGHTS['call'];
  const sessions: Record<string, { indicator_id: string; nilai: number }[]> = {};

  temuan.forEach((t, i) => {
    const key = t.no_tiket?.trim() || `__no_ticket_${t.created_at ?? t.period_id ?? i}`;
    if (!sessions[key]) sessions[key] = [];
    sessions[key].push(t);
  });

  const MAX_SAMPLING = 5;
  const sessionScoresArr = Object.values(sessions).map(s =>
    scoreSession(indicators, s, weight)
  );

  const sortedScores = [...sessionScoresArr].sort((a, b) => a - b);
  const selectedScores = sortedScores.slice(0, MAX_SAMPLING);

  const paddedScores = [...selectedScores];
  while (paddedScores.length < MAX_SAMPLING) {
    paddedScores.push(100);
  }

  const finalScore = paddedScores.reduce((a, b) => a + b, 0) / MAX_SAMPLING;

  const calculateQuickCategoryScore = (cat: 'critical' | 'non_critical') => {
    if (weight.scoring_mode === 'no_category') return finalScore;
    const catInds = indicators.filter(i => i.category === cat);
    if (catInds.length === 0) return 100;
    let totalB = 0, earnedB = 0;
    catInds.forEach(ind => {
      const tList = temuan.filter(t => t.indicator_id === ind.id);
      const val = tList.length > 0 ? Math.min(...tList.map(t => t.nilai)) : 3;
      totalB  += ind.bobot;
      earnedB += (val / 3) * ind.bobot;
    });
    return (earnedB / totalB) * 100;
  };

  const buildDetail = (cat: 'critical' | 'non_critical') => {
    const targetInds = weight.scoring_mode === 'no_category'
      ? indicators
      : indicators.filter(i => i.category === cat);

    return targetInds.map(ind => {
      const matchingTemuan = temuan.filter(t => t.indicator_id === ind.id);
      const avgNilai = matchingTemuan.length > 0
        ? matchingTemuan.reduce((a, b) => a + b.nilai, 0) / matchingTemuan.length
        : 3;
      return {
        indicatorId: ind.id,
        name:        ind.name,
        bobot:       ind.bobot,
        nilai:       avgNilai,
        temuanCount: matchingTemuan.length,
        isNa:        false,
        contribution: (avgNilai / 3) * ind.bobot,
        selectedForScoring: true,
      } satisfies ScoreDetail;
    });
  };

  return {
    finalScore,
    nonCriticalScore:   calculateQuickCategoryScore('non_critical'),
    criticalScore:      calculateQuickCategoryScore('critical'),
    nonCriticalDetail:  weight.scoring_mode === 'no_category' ? [] : buildDetail('non_critical'),
    criticalDetail:     weight.scoring_mode === 'no_category' ? [] : buildDetail('critical'),
    sessionCount:       Object.keys(sessions).length,
    sessionScores:      sortedScores,
  } satisfies QAScore;
}

export const EXCLUDED_FOLDERS = ['tim om', 'tim qa', 'tim spv', 'tim da & konten'];
export const EXCLUDED_JABATAN = ['qa', 'trainer', 'wfm', 'team leader', 'team_leader', 'supervisor', 'spv', 'operational manager', 'operation_manager', 'operation manager'];

export function isAgentExcluded(
  tim?: string | null,
  batchName?: string | null,
  jabatan?: string | null
): boolean {
  const t = (tim ?? '').toLowerCase().trim();
  const b = (batchName ?? '').toLowerCase().trim();
  const j = (jabatan ?? '').toLowerCase().trim();
  return EXCLUDED_FOLDERS.includes(t)
      || EXCLUDED_FOLDERS.includes(b)
      || EXCLUDED_JABATAN.includes(j);
}

export const scoreColor = (score: number) => {
  if (score >= 85) return 'text-green-500';
  if (score >= 70) return 'text-amber-500';
  return 'text-red-500';
};

export const scoreBg = (score: number) => {
  if (score >= 85) return 'bg-green-500';
  if (score >= 70) return 'bg-amber-500';
  return 'bg-red-500';
};

export const scoreLabel = (score: number) => {
  if (score >= 85) return 'Baik';
  if (score >= 70) return 'Cukup';
  return 'Perlu Perhatian';
};
