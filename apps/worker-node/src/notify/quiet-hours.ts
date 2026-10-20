/** Quiet hours 22.00-08.00 Europe/Istanbul (plan 10.5/6). */
export const QUIET_START_HOUR = 22;
export const QUIET_END_HOUR = 8;
const TZ = 'Europe/Istanbul';

function istanbulParts(d: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return { hour: get('hour'), minute: get('minute') };
}

export function isQuietHour(d: Date): boolean {
  const { hour } = istanbulParts(d);
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/** The first moment at or after `d` that is outside quiet hours (08.00 Istanbul). */
export function nextSendTime(d: Date): Date {
  if (!isQuietHour(d)) return d;
  const { hour, minute } = istanbulParts(d);
  const minutesNow = hour * 60 + minute;
  const target = QUIET_END_HOUR * 60;
  const wait = minutesNow < target ? target - minutesNow : 24 * 60 - minutesNow + target;
  const t = new Date(d.getTime() + wait * 60_000);
  t.setUTCSeconds(0, 0);
  return t;
}
