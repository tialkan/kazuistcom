"""Builds packages/casuist/fixtures/kayitlar.json from primary source files (see KAYNAK.md).

Usage (inputs live outside the repository, in an empty working folder):
  pdftotext -layout 6698.pdf 6698.txt   (same for 6098 and 2709)
  python3 -I uret_fikstur.py <folder with 6698.txt 6098.txt 2709.txt y<id>.txt> <repo>/services/worker-py/tests/fixtures \
      > kayitlar.json

The script only cuts articles and decision headers; it never rewrites legal text. Run it with python3 -I.
"""

import hashlib
import html
import json
import re
import sys
import uuid

SRC = sys.argv[1]
WORKER_FIXTURES = sys.argv[2]
FETCHED_AT = '2026-11-07T09:00:00Z'
NS = uuid.UUID('6f0b7a4e-5c1d-4c7b-9e0e-1a2b3c4d5e6f')

LAWS = {
    '6698': {
        'ad': 'Kişisel Verilerin Korunması Kanunu',
        'kisa': 'KVKK',
        'url': 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6698&MevzuatTur=1&MevzuatTertip=5',
        'maddeler': None,
    },
    '6098': {
        'ad': 'Türk Borçlar Kanunu',
        'kisa': 'TBK',
        'url': 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6098&MevzuatTur=1&MevzuatTertip=5',
        'maddeler': set(range(49, 77)),
    },
    '2709': {
        'ad': 'Türkiye Cumhuriyeti Anayasası',
        'kisa': 'Anayasa',
        'url': 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=2709&MevzuatTur=1&MevzuatTertip=5',
        'maddeler': {13, 20, 90, 148, 153},
    },
}

# Decision dates come from the karararama result list (kararTarihi) of the same fetch.
DECISIONS = {
    '746229100': '2022-03-23',
    '1196596300': '2025-10-23',
    '899210400': '2023-03-28',
    '729300000': '2021-11-09',
    '54419600': '2012-06-27',
    '77008700': '2006-09-20',
    '831914500': '2022-10-31',
}

EM_DASH = chr(0x2014)


FOOTNOTE_START = re.compile(r'^\s*\d{1,3}\s*$')
FOOTNOTE_BODY = re.compile(r'^\s*\d{1,2}/\d{1,2}/\d{4}\s+tarihli')


def strip_footnotes(raw: str) -> str:
    """Mevzuat PDFs carry change footnotes at the bottom of a page: a line with the footnote number, then
    "d/m/yyyy tarihli ..." up to the page end. They are not article text and are removed with their markers."""
    pages = []
    for page in raw.split('\f'):
        lines = page.split('\n')
        cut = len(lines)
        for i in range(len(lines) - 1):
            if FOOTNOTE_START.match(lines[i]) and FOOTNOTE_BODY.match(lines[i + 1]):
                cut = i
                break
        # A page number alone on the last line.
        kept = lines[:cut]
        while kept and (not kept[-1].strip() or re.fullmatch(r'\s*\d{1,3}\s*', kept[-1])):
            kept.pop()
        pages.append('\n'.join(kept))
    text = '\n'.join(pages)
    # Inline markers: "ilişkilidir.2", "Kabahatler1", "(…)5", "yetkileri 83", ". 87 88 (Ek".
    text = re.sub(r'(?<=[a-zçğıöşü]{4}\.)\d{1,3}(?=\s|$)', '', text)
    text = re.sub(r'(?<=[a-zçğıöşü])\d{1,3}(?=\s|$)', '', text)
    text = re.sub(r'(?<=\(…\))\d{1,3}', '', text)
    text = re.sub(r'(?<=[\.\)])((?:\s+\d{2,3})+)(?=\s+[\(A-ZÇĞİÖŞÜ]|\s*$)', '', text)
    text = re.sub(r'(?<=\.)\s+\d{1,3}(?=\s+\(\d+\))', '', text)
    return text


def clean(text: str) -> str:
    # Replacement characters and soft hyphens of the source are dropped; U+2014 is never written (CLAUDE.md).
    text = text.replace(chr(0xFFFD), '').replace(chr(0xAD), '').replace(EM_DASH, '-').replace('\f', '\n')
    lines = [re.sub(r'[ \t]+', ' ', ln).strip() for ln in text.split('\n')]
    out, para = [], []
    for ln in lines:
        if not ln:
            if para:
                out.append(' '.join(para))
                para = []
            continue
        para.append(ln)
    if para:
        out.append(' '.join(para))
    return '\n'.join(out)


def rid(key: str) -> str:
    return str(uuid.uuid5(NS, key))


def record(**kw):
    base = {
        'jurisdiction': 'TR',
        'validFrom': None,
        'validTo': None,
        'amendedBy': None,
        'anonymized': False,
        'anonymizationVersion': None,
        'openalexCitedBy': None,
        'citedByCount': None,
        'lang': 'tr',
        'court': None,
        'chamber': None,
        'esasNo': None,
        'kararNo': None,
        'date': None,
        'fetchedAt': FETCHED_AT,
    }
    base.update(kw)
    base['id'] = rid(base['sourceKey'])
    return base


def law_records(no: str):
    meta = LAWS[no]
    raw = strip_footnotes(open(f'{SRC}/{no}.txt', encoding='utf-8').read())
    # Publication date as printed in the header of the official text ("Yayımlandığı Resmî Gazete : Tarih : 7/4/2016").
    rg = re.search(r'Yayımlandığı Resmî Gazete\s*:\s*Tarih\s*:\s*(\d{1,2})/(\d{1,2})/(\d{4})', raw)
    published = f'{rg.group(3)}-{int(rg.group(2)):02d}-{int(rg.group(1)):02d}' if rg else None
    # Article heading: "MADDE 11- (1)" (KVKK, TBK) or "Madde 20 -" with an en dash (Anayasa).
    pat = re.compile(r'^\s*(?:MADDE|Madde)\s+(\d+)\s*[-' + chr(0x2013) + r']\s*', re.M)
    marks = [m for m in pat.finditer(raw)]
    # Stop before transitional and repealed article blocks of the Constitution ("Geçici Madde").
    out = []
    for i, m in enumerate(marks):
        n = int(m.group(1))
        start = m.start()
        end = marks[i + 1].start() if i + 1 < len(marks) else len(raw)
        prev_line_start = raw.rfind('\n', 0, start - 1)
        heading = raw[prev_line_start:start].strip()
        if 'Geçici' in raw[max(0, start - 20):start + 20]:
            continue
        if meta['maddeler'] is not None and n not in meta['maddeler']:
            continue
        body = raw[m.end():end]
        # Drop the next article's caption line, which sits just before its heading.
        if i + 1 < len(marks):
            cut = body.rstrip().rfind('\n')
            tail = body[cut:].strip() if cut >= 0 else ''
            if tail and len(tail) < 90 and not tail.endswith(('.', ',', ';', ':')):
                body = body[:cut]
        # Section headings ("ALTINCI BÖLÜM" and the title line under it) belong to the next articles.
        blines = body.split('\n')
        for j, ln in enumerate(blines):
            if re.fullmatch(r'\s*[A-ZÇĞİÖŞÜ ]+\s(BÖLÜM|KISIM|AYIRIM)\s*', ln):
                body = '\n'.join(blines[:j])
                break
        text = clean(body)
        if not text or any(r['normRefs'][0]['madde'] == str(n) for r in out):
            continue
        caption = clean(heading).split('\n')[-1] if heading else ''
        caption = re.sub(r'\s+\d{1,3}$', '', caption)
        if len(caption) > 90 or caption.isupper():
            caption = ''
        title = f"{meta['ad']} m.{n}" + (f' {caption}' if caption else '')
        out.append(
            record(
                type='mevzuat',
                title=title,
                date=published,
                authorityClass='baglayici_norm',
                status='yururlukte',
                normRefs=[{'kanunNo': no, 'madde': str(n)}],
                licenseBasis='Resmî metin (FSEK m.31); Mevzuat Bilgi Sistemi',
                sourceUrl=meta['url'],
                sourceKey=f'mevzuat:{no}:m{n}',
                text=text,
            )
        )
    return out


def decision_records():
    out = []
    for doc_id, day in DECISIONS.items():
        raw = open(f'{SRC}/y{doc_id}.txt', encoding='utf-8').read()
        first = raw.strip().split('\n')[0]
        m = re.match(r'\s*(.+?)\s{2,}(\S+)\s+E\.\s*,\s*(\S+?)\s*K\.', first)
        if not m:
            raise SystemExit(f'header not parsed: {doc_id}')
        chamber, esas, karar = m.group(1).strip(), m.group(2), m.group(3)
        body = raw[raw.find('"İçtihat Metni"') + len('"İçtihat Metni"'):]
        text = clean(body)
        hgk = chamber in ('Hukuk Genel Kurulu', 'Ceza Genel Kurulu')
        out.append(
            record(
                type='karar',
                title=f'Yargıtay {chamber} E. {esas} K. {karar}',
                court='Yargıtay',
                chamber=chamber,
                esasNo=esas,
                kararNo=karar,
                date=day,
                authorityClass='yuksek_emsal' if hgk else 'emsal',
                status='bilinmiyor',
                normRefs=[],
                licenseBasis='Resmî karar (FSEK m.31); Yargıtay Karar Arama, kaynağında anonim yayım',
                sourceUrl='https://karararama.yargitay.gov.tr/',
                sourceKey=f'yargitay:{doc_id}',
                text=text,
            )
        )
    return out


def kvkk_board_record():
    raw = open(f'{WORKER_FIXTURES}/kvkk/detay-2024-592.html', encoding='utf-8').read()
    raw = re.sub(r'<script.*?</script>|<style.*?</style>', '', raw, flags=re.S)
    text = html.unescape(re.sub(r'<[^>]+>', '\n', raw))
    start = text.find('Kuruma intikal eden')
    text = clean(text[start:])
    end = text.find('Paylaş')
    if end > 0:
        text = text[:end].strip()
    return record(
        type='kurul_karari',
        title='Kişisel Verileri Koruma Kurulu 18/04/2024 tarihli ve 2024/592 sayılı karar özeti',
        court='Kişisel Verileri Koruma Kurulu',
        kararNo='2024/592',
        date='2024-04-18',
        authorityClass='idari_karar',
        status='bilinmiyor',
        normRefs=[],
        licenseBasis='Resmî yayın; Kurul karar özetleri kurumun sitesinde kamuya açık',
        sourceUrl='https://www.kvkk.gov.tr/Icerik/8881/2024-592',
        sourceKey='kvkk:2024-592',
        text=text,
    )


def gdpr_records():
    raw = open(f'{WORKER_FIXTURES}/eurlex/32016R0679-ilk2.xhtml', encoding='utf-8').read()
    text = html.unescape(re.sub(r'<[^>]+>', '\n', raw))
    text = clean(text)
    parts = re.split(r'\n(?=Article \d+\n)', '\n' + text)
    out = []
    for p in parts:
        m = re.match(r'\s*Article (\d+)\n([^\n]+)\n(.*)', p, re.S)
        if not m:
            continue
        n, caption, body = m.group(1), m.group(2), m.group(3).strip()
        out.append(
            record(
                type='ab_hukuku',
                title=f'Regulation (EU) 2016/679 (GDPR) Art. {n} {caption}',
                jurisdiction='AB',
                lang='en',
                authorityClass='karsilastirmali',
                status='yururlukte',
                normRefs=[{'kanunNo': 'GDPR', 'madde': n}],
                licenseBasis='AB yeniden kullanım kararı (2011/833/AB); EUR-Lex',
                sourceUrl='https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679',
                sourceKey=f'eurlex:32016R0679:art{n}',
                text=body,
            )
        )
    return out


def main():
    records = []
    for no in ('6698', '6098', '2709'):
        records.extend(law_records(no))
    records.extend(decision_records())
    records.append(kvkk_board_record())
    records.extend(gdpr_records())
    for r in records:
        assert EM_DASH not in r['text'] and EM_DASH not in r['title']
    digest = hashlib.sha256(json.dumps(records, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    json.dump(
        {'surum': 'fikstur-2026-11-07', 'sha256': digest, 'kayitlar': records},
        sys.stdout,
        ensure_ascii=False,
        indent=1,
    )


main()
