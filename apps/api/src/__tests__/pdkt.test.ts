import { describe, it, expect, vi } from 'vitest';
import * as pdktService from '../services/pdkt-service';

vi.mock('../lib/supabase', () => ({
  createAdminClient: () => ({
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: '1', user_id: 'user1', config: {}, emails: [] }, error: null }),
    update: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    select_inner: vi.fn().mockReturnThis(),
  }),
  supabaseAdmin: {
    rpc: vi.fn().mockResolvedValue({ data: 'history1', error: null }),
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: {}, error: null }),
  }
}));

describe('PDKT Service', () => {
  it('should fetch mailbox items', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null })
    };
    const items = await pdktService.fetchMailboxItems(mockSupabase, 'user1');
    expect(items).toHaveLength(1);
    expect(mockSupabase.from).toHaveBeenCalledWith('pdkt_mailbox_items');
  });

  it('should create mailbox item via RPC', async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({ data: 'new-id', error: null })
    };
    const payload = {
      sender_name: 'Test',
      sender_email: 'test@example.com',
      subject: 'Hello',
      snippet: 'Hi',
    };
    const id = await pdktService.createMailboxItem(mockSupabase, payload);
    expect(id).toBe('new-id');
    expect(mockSupabase.rpc).toHaveBeenCalledWith('submit_pdkt_mailbox_batch', expect.any(Object));
  });
});
