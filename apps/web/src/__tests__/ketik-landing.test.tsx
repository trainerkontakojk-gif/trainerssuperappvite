import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '../store/authStore';

// Mock modules before imports
vi.mock('../routes/ketik/ketikApi', () => ({
  ketikApi: {
    getSettings: vi.fn().mockResolvedValue({
      scenarios: [{ id: 's1', title: 'Test Scenario', description: 'Test', category: 'General', isActive: true }],
      consumerTypes: [{ id: 'ct1', name: 'Test Consumer', description: '', difficulty: 'Mudah' }],
      quickTemplates: [],
      activeConsumerTypeId: 'random',
      identitySettings: { displayName: '', signatureName: '', phoneNumber: '', city: '' },
      selectedModel: 'gemini-3.1-flash-lite',
      simulationDuration: 5,
      responsePacingMode: 'realistic',
    }),
    getHistory: vi.fn().mockResolvedValue([]),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    clearHistory: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    persistSession: vi.fn().mockResolvedValue({}),
    startReview: vi.fn().mockResolvedValue({}),
    getReviewStatus: vi.fn().mockResolvedValue({ status: 'completed', resultReady: true }),
    getReviewDetail: vi.fn().mockResolvedValue({
      sessionId: 'sess1',
      review: { id: 'r1', sessionId: 'sess1', aiSummary: 'Good', strengths: [], weaknesses: [], coachingFocus: [], createdAt: '' },
      typos: [],
      scores: { final: 85, empathy: 80, probing: 85, typo: 90, compliance: 85 },
    }),
    getUsageSummary: vi.fn().mockResolvedValue({
      total_calls: 10,
      total_input_tokens: 1000,
      total_output_tokens: 500,
      total_tokens: 1500,
      total_cost_idr: 5000,
      periodLabel: 'Januari 2025',
    }),
    generate: vi.fn().mockResolvedValue({ text: 'Test response' }),
  },
}));

import KetikLanding from '../routes/ketik/index';

describe('KETIK Landing Page', () => {
  beforeEach(() => {
    // Mock localStorage
    const store: Record<string, string> = { auth_token: 'test-token' };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => store[key] ?? null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => { store[key] = value; });
    useAuthStore.setState({ session: { access_token: 'test-token' } as any, profile: { id: 'u1' } as any });
  });

  it('renders ModuleWorkspaceIntro with correct description text', async () => {
    render(<KetikLanding />);

    await screen.findByText('Mulai Simulasi');
    expect(screen.getByText('Mulai Simulasi')).toBeDefined();
    expect(screen.getByText('Pengaturan')).toBeDefined();
    expect(screen.getByText('Riwayat')).toBeDefined();
    expect(screen.getByText('Usage Bulan Ini')).toBeDefined();

    expect(screen.getByText(/Latih komunikasi chat dalam satu workspace yang fokus\./)).toBeDefined();
  });

  it('shows SettingsModal when Pengaturan is clicked', async () => {
    const user = userEvent.setup();
    render(<KetikLanding />);

    await screen.findByText('Pengaturan');
    await user.click(screen.getByText('Pengaturan'));
    expect(screen.getByText('Pengaturan Simulasi')).toBeDefined();
  });

  it('shows HistoryModal when Riwayat is clicked', async () => {
    const user = userEvent.setup();
    render(<KetikLanding />);

    await screen.findByText('Riwayat');
    await user.click(screen.getByText('Riwayat'));
    expect(screen.getByText('Riwayat Simulasi')).toBeDefined();
  });

  it('shows UsageModal when Usage Bulan Ini is clicked', async () => {
    const user = userEvent.setup();
    render(<KetikLanding />);

    await screen.findByText('Usage Bulan Ini');
    await user.click(screen.getByText('Usage Bulan Ini'));
    expect(screen.getByText(/Estimasi biaya/)).toBeDefined();
  });

  it('starts simulation when Mulai Simulasi is clicked', async () => {
    const user = userEvent.setup();
    render(<KetikLanding />);

    await screen.findByText('Mulai Simulasi');
    await user.click(screen.getByText('Mulai Simulasi'));

    // Should transition to chat view - check for timer display (5:00 for 5min default)
    await screen.findByText(/5:00/);
  });
});
