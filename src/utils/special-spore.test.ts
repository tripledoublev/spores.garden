import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findSporeByOrigin, stealSpore } from './special-spore';
import { getBacklinks, getRecord } from '../at-client';
import { createRecord } from '../oauth';
import { showAlertModal } from './confirm-modal';

vi.mock('../at-client', () => ({
  getBacklinks: vi.fn(),
  getRecord: vi.fn(),
}));

vi.mock('../oauth', () => ({
  createRecord: vi.fn(),
}));

vi.mock('../config', () => ({
  isValidSpore: vi.fn(() => true),
}));

vi.mock('./confirm-modal', () => ({
  showAlertModal: vi.fn(),
}));

describe('special spore guardrails', () => {
  const now = new Date('2026-02-16T12:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  it('ignores implausible future-timestamp records when resolving holder', async () => {
    vi.mocked(getBacklinks).mockResolvedValue({
      records: [
        { did: 'did:plc:owner', collection: 'garden.spores.item.specialSpore', rkey: 'abc' },
      ],
    } as any);

    vi.mocked(getRecord).mockResolvedValue({
      value: {
        createdAt: '2026-02-16T12:20:00.000Z',
      },
    } as any);

    const result = await findSporeByOrigin('did:plc:origin');
    expect(result).toBeNull();
  });

  it('blocks rapid re-steals inside cooldown window', async () => {
    vi.mocked(getBacklinks).mockResolvedValue({
      records: [
        { did: 'did:plc:current-owner', collection: 'garden.spores.item.specialSpore', rkey: 'abc' },
      ],
    } as any);

    vi.mocked(getRecord).mockResolvedValue({
      value: {
        subject: 'did:plc:origin',
        createdAt: '2026-02-16T11:59:30.000Z',
      },
    } as any);

    await expect(
      stealSpore('did:plc:origin', 'did:plc:new-owner', 'current-owner')
    ).rejects.toThrow('just captured');

    expect(createRecord).not.toHaveBeenCalled();
    expect(showAlertModal).not.toHaveBeenCalled();
  });

  it('allows steals after cooldown and writes capture record', async () => {
    vi.mocked(getBacklinks).mockResolvedValue({
      records: [
        { did: 'did:plc:current-owner', collection: 'garden.spores.item.specialSpore', rkey: 'abc' },
      ],
    } as any);

    vi.mocked(getRecord).mockResolvedValue({
      value: {
        subject: 'did:plc:origin',
        createdAt: '2026-02-16T11:58:00.000Z',
      },
      uri: 'at://did:plc:current-owner/garden.spores.item.specialSpore/abc',
    } as any);

    vi.mocked(createRecord).mockResolvedValue({
      uri: 'at://did:plc:new-owner/garden.spores.item.specialSpore/xyz',
    } as any);

    await stealSpore('did:plc:origin', 'did:plc:new-owner', 'current-owner');

    expect(createRecord).toHaveBeenCalledWith('garden.spores.item.specialSpore', expect.objectContaining({
      $type: 'garden.spores.item.specialSpore',
      subject: 'did:plc:origin',
    }));
    expect(showAlertModal).toHaveBeenCalled();
  });
});
