import { describe, expect, it } from 'vitest';
import {
  AccountPurgePayload,
  ConsentContext,
  KvkkGuestRequestInput,
  KvkkRequestInput,
  NotificationPreferencesInput,
  NotifyPayload,
  TakedownRequestInput,
  jobPayloadSchemas,
  jobTypes,
  kvkkDueAt,
  kvkkRequestKindArticle,
  kvkkRequestKinds,
  takedownDeadlines,
} from '../src/index.ts';

const id = '00000000-0000-4000-8000-000000000001';

describe('KVKK applications (m.11, m.13/2)', () => {
  it('covers the nine rights of m.11/1 with an article reference each', () => {
    expect(kvkkRequestKinds).toHaveLength(9);
    expect(Object.keys(kvkkRequestKindArticle).sort()).toEqual([...kvkkRequestKinds].sort());
    expect(new Set(Object.values(kvkkRequestKindArticle)).size).toBe(9);
  });
  it('is due thirty days after it arrives', () => {
    expect(kvkkDueAt(new Date('2026-10-20T09:00:00Z')).toISOString()).toBe('2026-11-19T09:00:00.000Z');
  });
  it('signed in input defaults the reply channel to e-mail and stays closed', () => {
    expect(KvkkRequestInput.parse({ kind: 'zarar_giderimi', detail: 'x' }).replyChannel).toBe('eposta');
    expect(KvkkRequestInput.safeParse({ kind: 'bilgi', detail: 'x', userId: id }).success).toBe(false);
  });
  it('guest input requires the Teblig m.5 fields and the declaration', () => {
    const ok = {
      kind: 'silme',
      detail: 'Karar metnindeki adimin maskelenmesini istiyorum.',
      requesterName: 'Ornek Kisi',
      nationality: 'TR',
      identityNumber: '10000000146',
      address: 'Ornek Mah. Ornek Sok. No 1, Ankara',
      contactEmail: 'kisi@example.invalid',
      relation: 'karar_metninde_adi_gecen',
      replyChannel: 'eposta',
      declaration: true,
    };
    expect(KvkkGuestRequestInput.safeParse(ok).success).toBe(true);
    expect(KvkkGuestRequestInput.safeParse({ ...ok, declaration: false }).success).toBe(false);
    expect(KvkkGuestRequestInput.safeParse({ ...ok, address: undefined }).success).toBe(false);
    expect(KvkkGuestRequestInput.safeParse({ ...ok, nationality: 'tr' }).success).toBe(false);
  });
});

describe('takedown requests', () => {
  it('hides within 72 hours and answers personal data requests within thirty days', () => {
    const at = new Date('2026-10-20T00:00:00Z');
    expect(takedownDeadlines('kisisel_veri', at)).toEqual({
      hideDueAt: new Date('2026-10-23T00:00:00Z'),
      dueAt: new Date('2026-11-19T00:00:00Z'),
    });
    expect(takedownDeadlines('telif', at).dueAt).toBeNull();
  });
  it('targets records and Kampus posts or files; the v1 recordId field is gone', () => {
    const base = { kind: 'telif', targetId: id, reason: 'izinsiz', contactEmail: 'a@example.invalid' };
    expect(TakedownRequestInput.safeParse({ ...base, targetType: 'kampus_file' }).success).toBe(true);
    expect(TakedownRequestInput.safeParse({ ...base, targetType: 'kampus_profile' }).success).toBe(false);
    expect(TakedownRequestInput.safeParse({ ...base, targetType: 'record', recordId: id }).success).toBe(
      false,
    );
  });
});

describe('job payloads and consent context', () => {
  it('has a payload schema only for known job types', () => {
    for (const t of Object.keys(jobPayloadSchemas)) expect(jobTypes).toContain(t);
    expect(jobTypes.at(-1)).toBe('account.purge');
  });
  it('notify.send carries ids only', () => {
    expect(NotifyPayload.safeParse({ type: 'odeme', userId: id }).success).toBe(true);
    expect(NotifyPayload.safeParse({ type: 'odeme', userId: id, email: 'a@example.invalid' }).success).toBe(
      false,
    );
    expect(AccountPurgePayload.safeParse({ userId: id }).success).toBe(true);
    expect(AccountPurgePayload.safeParse({ userId: 'x' }).success).toBe(false);
  });
  it('notification preferences accept known types only', () => {
    expect(NotificationPreferencesInput.safeParse({ email: { kampanya: false } }).success).toBe(true);
    expect(NotificationPreferencesInput.safeParse({ email: { bilinmeyen: true } }).success).toBe(false);
  });
  it('consent context is closed', () => {
    expect(ConsentContext.safeParse({ productCode: 'ogrenci.yillik', provider: 'gemini' }).success).toBe(
      true,
    );
    expect(ConsentContext.safeParse({ email: 'a@example.invalid' }).success).toBe(false);
  });
});
