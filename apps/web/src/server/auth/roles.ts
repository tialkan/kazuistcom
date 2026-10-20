/** Roles (plan 10.1, 10.9). `misafir` is implicit for requests without a session; it is never stored. */
export const roles = [
  'misafir',
  'kullanici',
  'ogrenci_dogrulanmis',
  'plus',
  'akademisyen',
  'editor',
  'yonetici',
] as const;
export type Role = (typeof roles)[number];
export type StoredRole = Exclude<Role, 'misafir'>;

export const roleDescriptions: Record<StoredRole, string> = {
  kullanici: 'Kayitli kullanici',
  ogrenci_dogrulanmis: 'edu.tr adresi dogrulanmis ogrenci',
  plus: 'Ucretli plan',
  akademisyen: 'Akademisyen plani',
  editor: 'Hukukcu editor',
  yonetici: 'Yonetim paneli',
};

export function isRole(value: string): value is Role {
  return (roles as readonly string[]).includes(value);
}

/** True when the principal holds at least one of the required roles. Staff roles imply nothing else. */
export function hasAnyRole(held: readonly Role[], required: readonly Role[]): boolean {
  if (required.length === 0) return true;
  return required.some((r) => held.includes(r));
}
