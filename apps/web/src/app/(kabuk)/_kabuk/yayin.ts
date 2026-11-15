import { moduller } from './rotalar.ts';

/**
 * LAUNCH MODULE SET: the one place that decides which modules production shows.
 *
 * Decision (Tarık, relayed by the orchestrator on 2026-11-15): the first launch is a narrowed core:
 * Ara with the sourced summary, Kaydettiklerim, Yazma (template and abbreviations), Rehberler and /tespit.
 * A module without approved content is not shown in production. Deferred today:
 *   - pratik:   no card has the editor approvals yet (content/desteler, plan 10.6); production serves 0 cards.
 *   - kalemcik: the writing coach has no approved message set and is not part of the core.
 *   - atif-agi: the citation network has no production data yet (only the sample network).
 *
 * In production a deferred module leaves the tab bar, the footer, the home page and the sitemap, and every
 * route under it answers 404 (its layout calls notFound()). The rule fails closed: any production build
 * (NODE_ENV=production) counts as production unless KAZUIST_ENV says development or test, so a deployment that
 * forgot KAZUIST_ENV still hides the modules. `next dev`, the unit tests, and a local production build started
 * with KAZUIST_ENV=development show every module, so the modules keep being built and tested.
 *
 * To open a deferred module in production once its content is approved, set KAZUIST_MODULLER to a comma
 * separated list of the keys below (e.g. `KAZUIST_MODULLER=pratik,atif-agi`), or `hepsi` for all of them,
 * and add its line back to apps/web/public/llms.txt. A permanent opening belongs here: remove the key from
 * `ertelenenModuller`. Read at request time (the root layout renders per request), so no rebuild is needed.
 */
export const ertelenenModuller = ['pratik', 'kalemcik', 'atif-agi'] as const;
export type ErtelenenModul = (typeof ertelenenModuller)[number];

type Env = Record<string, string | undefined>;

/**
 * True for a production build unless KAZUIST_ENV explicitly names development or test. Deliberately stricter
 * than the SEO rule (which opens only on a confirmed production): here the safe side is hiding.
 */
export const uretimMi = (env: Env = process.env) =>
  env.NODE_ENV === 'production' && env.KAZUIST_ENV !== 'development' && env.KAZUIST_ENV !== 'test';

/** Deferred modules opened in production by KAZUIST_MODULLER; unknown keys are ignored. */
function acilanlar(env: Env): ReadonlySet<ErtelenenModul> {
  const liste = (env.KAZUIST_MODULLER ?? '')
    .split(',')
    // Keys are ASCII and compared as written; no case mapping (a Turkish lower case would turn I into ı).
    .map((s) => s.trim())
    .filter(Boolean);
  if (liste.includes('hepsi')) return new Set(ertelenenModuller);
  return new Set(ertelenenModuller.filter((m) => liste.includes(m)));
}

/** Modules hidden in this environment. Empty outside production. */
export function gizliModuller(env: Env = process.env): ReadonlySet<ErtelenenModul> {
  if (!uretimMi(env)) return new Set();
  const acik = acilanlar(env);
  return new Set(ertelenenModuller.filter((m) => !acik.has(m)));
}

/** True when the module is shown in this environment. */
export const modulGorunur = (modul: ErtelenenModul, env: Env = process.env) => !gizliModuller(env).has(modul);

/** URL root of each deferred module. */
export const ertelenenKokler: Record<ErtelenenModul, string> = {
  pratik: '/pratik',
  kalemcik: '/kalemcik',
  'atif-agi': '/atif-agi',
};

/** True when `yol` is a page of a module hidden in this environment (the root or anything below it). */
export function yolGizli(yol: string, env: Env = process.env): boolean {
  for (const m of gizliModuller(env)) {
    const kok = ertelenenKokler[m];
    if (yol === kok || yol.startsWith(`${kok}/`)) return true;
  }
  return false;
}

/** Module tabs shown in this environment, in the order of rotalar.ts. Server side only (reads the env). */
export const gorunenModuller = (env: Env = process.env) => moduller.filter((m) => !yolGizli(m.href, env));
