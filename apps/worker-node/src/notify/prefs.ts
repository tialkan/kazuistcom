import { isCommercial, mandatoryEmailTypes, type Channel, type NotificationType } from './types.ts';

/**
 * notification_prefs stores one jsonb object per channel: { "<type>": boolean }.
 * Defaults: informational messages on, commercial off (needs separate consent, plan 10.8).
 */
export type ChannelPrefs = Partial<Record<NotificationType, boolean>>;
export interface Prefs {
  email: ChannelPrefs;
  web_push: ChannelPrefs;
  apns: ChannelPrefs;
}

export function channelAllows(prefs: Prefs, channel: Channel, type: NotificationType): boolean {
  if (channel === 'email' && mandatoryEmailTypes.includes(type)) return true;
  const v = prefs[channel][type];
  if (v !== undefined) return v;
  return !isCommercial(type);
}

export interface CommercialGate {
  /** Latest acik_riza_pazarlama consent row is a grant. */
  consentGranted: boolean;
  /** Recipient is registered as allowing messages in IYS (Ileti Yonetim Sistemi). */
  iysAllowed: boolean;
}

/** Commercial messages need both the separate consent and the IYS record (6563, plan 10.8). */
export const commercialAllowed = (g: CommercialGate) => g.consentGranted && g.iysAllowed;
