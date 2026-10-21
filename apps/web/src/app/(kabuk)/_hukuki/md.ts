/**
 * Minimal, safe Markdown parser for content/hukuki. It understands exactly the subset the legal texts use
 * (headings, paragraphs, bullet and numbered lists with indented continuation lines, block quotes, pipe
 * tables, **bold**, *italic*, `code`, [links](url)). Raw HTML is never interpreted: it stays literal text.
 * The output is a plain tree rendered by MdGoster.tsx; nothing is injected as HTML.
 */
export type Satir =
  | { t: 'metin'; v: string }
  | { t: 'kalin' | 'egik'; c: Satir[] }
  | { t: 'kod'; v: string }
  | { t: 'bag'; href: string; c: Satir[] };

export type Blok =
  | { t: 'baslik'; seviye: 2 | 3 | 4; c: Satir[] }
  | { t: 'paragraf'; c: Satir[] }
  | { t: 'liste'; sirali: boolean; baslangic: number; ogeler: Satir[][] }
  | { t: 'alinti'; c: Blok[] }
  | { t: 'tablo'; baslik: Satir[][] | null; satirlar: Satir[][][] };

const GUVENLI_BAG = /^(https?:\/\/|mailto:|\/(?!\/)|#)/;

export function satirIci(s: string): Satir[] {
  const out: Satir[] = [];
  let metin = '';
  const it = () => {
    if (metin) out.push({ t: 'metin', v: metin });
    metin = '';
  };
  let i = 0;
  while (i < s.length) {
    const kalan = s.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^\*\*(.+?)\*\*/.exec(kalan))) {
      it();
      out.push({ t: 'kalin', c: satirIci(m[1] ?? '') });
      i += m[0].length;
    } else if ((m = /^\*([^*\s][^*]*?)\*/.exec(kalan))) {
      it();
      out.push({ t: 'egik', c: satirIci(m[1] ?? '') });
      i += m[0].length;
    } else if ((m = /^`([^`]+)`/.exec(kalan))) {
      it();
      out.push({ t: 'kod', v: m[1] ?? '' });
      i += m[0].length;
    } else if ((m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(kalan))) {
      const href = m[2] ?? '';
      if (GUVENLI_BAG.test(href)) {
        it();
        out.push({ t: 'bag', href, c: satirIci(m[1] ?? '') });
      } else {
        metin += m[1] ?? '';
      }
      i += m[0].length;
    } else {
      metin += s[i];
      i += 1;
    }
  }
  it();
  return out;
}

const hucreler = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
const ayracMi = (line: string) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line.trim());
const ogeRe = /^(\s{0,3})([-*]|(\d+)\.)\s+(.*)$/;

export function ayristir(md: string): Blok[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const bloklar: Blok[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      // The page title is the h1; body headings start at h2.
      const seviye = Math.min(4, Math.max(2, (h[1] ?? '').length)) as 2 | 3 | 4;
      bloklar.push({ t: 'baslik', seviye, c: satirIci((h[2] ?? '').trim()) });
      i++;
      continue;
    }
    if (line.startsWith('>')) {
      const ic: string[] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('>'))
        ic.push((lines[i++] ?? '').replace(/^>\s?/, ''));
      bloklar.push({ t: 'alinti', c: ayristir(ic.join('\n')) });
      continue;
    }
    if (line.trim().startsWith('|') && ayracMi(lines[i + 1] ?? '')) {
      const bas = hucreler(line);
      i += 2;
      const satirlar: Satir[][][] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('|'))
        satirlar.push(hucreler(lines[i++] ?? '').map(satirIci));
      bloklar.push({ t: 'tablo', baslik: bas.every((c) => !c) ? null : bas.map(satirIci), satirlar });
      continue;
    }
    const o = ogeRe.exec(line);
    if (o) {
      const sirali = Boolean(o[3]);
      const baslangic = sirali ? Number(o[3]) : 1;
      const ogeler: string[] = [];
      while (i < lines.length) {
        const l = lines[i] ?? '';
        const mo = ogeRe.exec(l);
        if (mo && Boolean(mo[3]) === sirali && (mo[1] ?? '').length < 2) {
          ogeler.push(mo[4] ?? '');
          i++;
        } else if (l.trim() && /^\s{2,}/.test(l) && ogeler.length) {
          ogeler[ogeler.length - 1] += ` ${l.trim()}`;
          i++;
        } else break;
      }
      bloklar.push({ t: 'liste', sirali, baslangic, ogeler: ogeler.map(satirIci) });
      continue;
    }
    const p: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? '';
      if (
        !l.trim() ||
        /^#{1,6}\s/.test(l) ||
        l.startsWith('>') ||
        ogeRe.test(l) ||
        (l.trim().startsWith('|') && ayracMi(lines[i + 1] ?? ''))
      )
        break;
      p.push(l.trim());
      i++;
    }
    bloklar.push({ t: 'paragraf', c: satirIci(p.join(' ')) });
  }
  return bloklar;
}

/** Flat YAML front matter (key: value per line, # comments). Enough for LegalFrontMatter; validated by zod. */
export function onBilgi(yaml: string): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const raw of yaml.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trimEnd();
    const m = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (!m?.[1]) continue;
    let v = (m[2] ?? '').trim();
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    out[m[1]] = v === 'true' ? true : v === 'false' ? false : v;
  }
  return out;
}
