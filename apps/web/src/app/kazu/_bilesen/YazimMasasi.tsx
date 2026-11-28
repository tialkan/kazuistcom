'use client';

import { useEffect, useMemo, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import tr from '@kazuist/i18n/tr/kazu.json';
import { BOS_CALISMA, type Calisma, type PmDugum } from '../_cekirdek/analiz.ts';
import { KazuPanel } from './KazuPanel.tsx';

type Tur = keyof typeof tr.iskelet;
// `calisma` holds the panel's work (claim card, sources, cases, rounds, checks); older drafts only had `iddia`.
type Taslak = { tur: Tur; baslik: string; govde: unknown; calisma?: Calisma; iddia?: Calisma['iddia'] };

// First slice: the draft lives in this browser only; server storage comes with the versioned document model.
const ANAHTAR = 'kazu.taslak.v1';
const TURLER = Object.keys(tr.iskelet) as Tur[];

function oku(): Taslak | null {
  try {
    const ham = localStorage.getItem(ANAHTAR);
    return ham ? (JSON.parse(ham) as Taslak) : null;
  } catch {
    return null;
  }
}

function yaz(t: Taslak) {
  try {
    localStorage.setItem(ANAHTAR, JSON.stringify(t));
  } catch {
    // private mode or full storage: the page keeps working without saving
  }
}

/** Skeleton document: one heading per section of the chosen type, each followed by an empty paragraph. */
function iskelet(tur: Tur) {
  return {
    type: 'doc',
    content: Object.values(tr.iskelet[tur]).flatMap((b) => [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: b }] },
      { type: 'paragraph' },
    ]),
  };
}

export function YazimMasasi() {
  const [taslak, setTaslak] = useState<Taslak | null>(null);
  const [kayitli, setKayitli] = useState<Taslak | null>(null);
  const [hazir, setHazir] = useState(false);
  useEffect(() => {
    setKayitli(oku());
    setHazir(true);
  }, []);
  if (!hazir) return <div className="kazu" />;
  if (!taslak) return <Giris kayitli={kayitli} onBasla={setTaslak} />;
  return <Masa ilk={taslak} />;
}

function Giris({ kayitli, onBasla }: { kayitli: Taslak | null; onBasla: (t: Taslak) => void }) {
  const [tur, setTur] = useState<Tur>('makale');
  const [baslik, setBaslik] = useState('');
  return (
    <div className="kazu kazu-giris">
      <section className="kazu-giris__kutu">
        <h1>{tr.giris.soru}</h1>
        <p className="kazu-soluk">{tr.giris.alt}</p>
        <div className="kazu-turler" role="radiogroup" aria-label={tr.giris.soru}>
          {TURLER.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tur === t}
              className={tur === t ? 'secili' : ''}
              onClick={() => setTur(t)}
            >
              {tr.giris.tur[t]}
            </button>
          ))}
        </div>
        <label className="kazu-alan">
          <span>{tr.giris.baslikEtiket}</span>
          <input value={baslik} onChange={(e) => setBaslik(e.target.value)} maxLength={200} />
          <small className="kazu-soluk">{tr.giris.baslikIpucu}</small>
        </label>
        <div className="kazu-giris__eylem">
          <button
            type="button"
            className="kazu-birincil"
            onClick={() => onBasla({ tur, baslik: baslik.trim(), govde: iskelet(tur), calisma: BOS_CALISMA })}
          >
            {tr.giris.basla}
          </button>
          {kayitli ? (
            <button type="button" className="kazu-ikincil" onClick={() => onBasla(kayitli)}>
              {tr.giris.devam}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Masa({ ilk }: { ilk: Taslak }) {
  const [baslik, setBaslik] = useState(ilk.baslik);
  const [calisma, setCalisma] = useState<Calisma>({
    ...BOS_CALISMA,
    ...ilk.calisma,
    iddia: ilk.calisma?.iddia ?? ilk.iddia ?? BOS_CALISMA.iddia,
  });
  const [govde, setGovde] = useState<PmDugum | null>((ilk.govde as PmDugum) ?? null);
  const [panel, setPanel] = useState(true);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Placeholder.configure({ placeholder: tr.yazi.yerTutucu }),
    ],
    content: ilk.govde as object,
    editorProps: {
      attributes: {
        class: 'kazu-metin',
        spellcheck: 'true',
        lang: 'tr',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': tr.yazi.etiket,
      },
    },
  });
  const durum = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            h2: e.isActive('heading', { level: 2 }),
            h3: e.isActive('heading', { level: 3 }),
            b: e.isActive('bold'),
            i: e.isActive('italic'),
            ul: e.isActive('bulletList'),
            ol: e.isActive('orderedList'),
            q: e.isActive('blockquote'),
            kelime: e.getText().split(/\s+/).filter(Boolean).length,
          }
        : null,
  });

  // autosave: at most once a second, only what changed
  useEffect(() => {
    if (!editor) return;
    let id = 0;
    const kaydet = () => {
      clearTimeout(id);
      id = window.setTimeout(() => {
        const g = editor.getJSON();
        setGovde(g as PmDugum);
        yaz({ tur: ilk.tur, baslik, govde: g, calisma });
      }, 800);
    };
    kaydet();
    editor.on('update', kaydet);
    return () => {
      clearTimeout(id);
      editor.off('update', kaydet);
    };
  }, [editor, baslik, calisma, ilk.tur]);

  const zincir = () => editor?.chain().focus();
  const [indiriliyor, setIndiriliyor] = useState(false);
  // Word export: the docx module is loaded only when asked for, the file is built in the browser
  const indir = async () => {
    if (!editor) return;
    setIndiriliyor(true);
    try {
      const { taslakDocx, dosyaAdi } = await import('../_cekirdek/docx-aktar.ts');
      const bayt = await taslakDocx(editor.getJSON(), baslik.trim());
      const url = URL.createObjectURL(
        new Blob([bayt.slice().buffer as ArrayBuffer], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = dosyaAdi(baslik);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setIndiriliyor(false);
    }
  };
  const araclar = useMemo(
    () =>
      [
        ['h2', tr.arac.baslik, () => zincir()?.toggleHeading({ level: 2 }).run()],
        ['h3', tr.arac.altBaslik, () => zincir()?.toggleHeading({ level: 3 }).run()],
        ['b', tr.arac.kalin, () => zincir()?.toggleBold().run()],
        ['i', tr.arac.italik, () => zincir()?.toggleItalic().run()],
        ['ul', tr.arac.liste, () => zincir()?.toggleBulletList().run()],
        ['ol', tr.arac.numarali, () => zincir()?.toggleOrderedList().run()],
        ['q', tr.arac.alinti, () => zincir()?.toggleBlockquote().run()],
      ] as const,
    [editor],
  );

  return (
    <div className={`kazu kazu-masa${panel ? ' panel-acik' : ''}`}>
      <header className="kazu-ust">
        <a href="/kazu" className="kazu-marka">
          Kazuist
        </a>
        <input
          className="kazu-baslik"
          value={baslik}
          placeholder={tr.giris.tur[ilk.tur]}
          aria-label={tr.giris.baslikEtiket}
          onChange={(e) => setBaslik(e.target.value)}
          maxLength={200}
        />
        <span className="kazu-durum">
          {tr.durum.kaydedildi} · {durum?.kelime ?? 0} {tr.durum.kelime}
        </span>
        <button type="button" className="kazu-ikincil" onClick={indir} disabled={indiriliyor}>
          {indiriliyor ? tr.arac.hazirlaniyor : tr.arac.word}
        </button>
        <button
          type="button"
          className="kazu-ikincil"
          aria-expanded={panel}
          onClick={() => setPanel((p) => !p)}
        >
          {panel ? tr.arac.kazuKapat : tr.arac.kazuAc}
        </button>
      </header>
      <div className="kazu-arac" role="toolbar" aria-label={tr.arac.etiket}>
        {araclar.map(([k, ad, f]) => (
          <button key={k} type="button" aria-pressed={!!durum?.[k]} onClick={f} title={ad}>
            {ad}
          </button>
        ))}
        <span className="kazu-ayrac" />
        <button type="button" onClick={() => zincir()?.undo().run()}>
          {tr.arac.geri}
        </button>
        <button type="button" onClick={() => zincir()?.redo().run()}>
          {tr.arac.ileri}
        </button>
      </div>
      <div className="kazu-govde">
        <div className="kazu-sayfa">
          <EditorContent editor={editor} />
        </div>
        {panel ? <KazuPanel govde={govde} baslik={baslik} calisma={calisma} setCalisma={setCalisma} /> : null}
      </div>
    </div>
  );
}
