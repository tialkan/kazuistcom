import { Dugme } from '@kazuist/ui';
import type { AgFiltresi } from '../_alan/tipler.ts';
import { tr } from './metin.ts';
import styles from '../atif-agi.module.css';

/**
 * Filters (plan 10.3: court, chamber, year). A plain GET form: it works without JavaScript and the filtered
 * address can be shared. `gorunum` is kept so the chosen view survives filtering.
 */
export function Suzgec({ filtre, gorunum }: { filtre: AgFiltresi; gorunum: 'ag' | 'tablo' }) {
  return (
    <form method="get" action="/atif-agi" className={styles.suzgec} aria-labelledby="suzgec-baslik">
      <h2 id="suzgec-baslik">{tr.filtre.baslik}</h2>
      <input type="hidden" name="gorunum" value={gorunum} />
      <div className={styles.alan}>
        <label htmlFor="f-court">{tr.filtre.mahkeme}</label>
        <select id="f-court" name="court" defaultValue={filtre.court ?? ''}>
          <option value="">{tr.filtre.tumKapsam}</option>
          <option value="Yargıtay">{tr.filtre.yargitay}</option>
          <option value="Anayasa Mahkemesi">{tr.filtre.aym}</option>
        </select>
      </div>
      <div className={styles.alan}>
        <label htmlFor="f-chamber">{tr.filtre.daire}</label>
        <select id="f-chamber" name="chamber" defaultValue={filtre.chamber ?? ''}>
          <option value="">{tr.filtre.tumKapsam}</option>
          <option value="Hukuk Genel Kurulu">{tr.filtre.hgk}</option>
          <option value="İçtihadı Birleştirme">{tr.filtre.ibk}</option>
        </select>
      </div>
      <div className={styles.alan}>
        <label htmlFor="f-from">{tr.filtre.baslangic}</label>
        <input
          id="f-from"
          name="from"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          defaultValue={filtre.from ?? ''}
        />
      </div>
      <div className={styles.alan}>
        <label htmlFor="f-to">{tr.filtre.bitis}</label>
        <input
          id="f-to"
          name="to"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          defaultValue={filtre.to ?? ''}
        />
      </div>
      <div className={`${styles.alan} ${styles.genisAlan}`}>
        <label htmlFor="f-topic">{tr.filtre.konu}</label>
        <input id="f-topic" name="topic" maxLength={80} defaultValue={filtre.topic ?? ''} />
      </div>
      <div className={styles.eylemler}>
        <Dugme type="submit">{tr.filtre.uygula}</Dugme>
        <Dugme tur="sessiz" href={`/atif-agi?gorunum=${gorunum}`}>
          {tr.filtre.temizle}
        </Dugme>
      </div>
    </form>
  );
}
