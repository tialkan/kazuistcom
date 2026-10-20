import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };

/**
 * Temporary profession list. Plan 10.1/1 puts it in content/meslekler.yaml (icerik agent) and
 * later an admin table; until those exist the ids live here and labels in i18n hesap.json.
 * Each profession has two looks and one gender neutral look (plan 10.1/2).
 */
export const professionIds = Object.keys(tr.meslekler) as (keyof typeof tr.meslekler)[];

export interface Profession {
  id: string;
  label: string;
  avatars: string[];
}

export function listProfessions(): Profession[] {
  return professionIds.map((id) => ({
    id,
    label: tr.meslekler[id],
    avatars: [`${id}-a`, `${id}-b`, `${id}-n`],
  }));
}

export function findProfession(id: string): Profession | undefined {
  return listProfessions().find((p) => p.id === id);
}
