/**
 * Open panel member names and the passages built in TypeScript (plan Ek E, FR-21, FR-80).
 *
 * For an open source (anonymizer policy open_source_match, today AYM) records.masked_text keeps the members a
 * decision lists on its own panel lines ("Başkan : Ad SOYAD", "Üyeler :" with the names below it, the signature
 * lines) readable, and the record page shows them. Search and summaries must not carry them: the embed.chunks
 * worker writes chunks.text from anonymizer.public_names.index_text, where each such name is "[Üye n]"
 * (services/worker-py/nlp/panel_names.py), so chunks.tsv, the embeddings and the prompt passages read from chunk
 * rows have no such name.
 *
 * There is no TypeScript port of index_text. Passages are cut here only where no chunk row exists yet (sql.ts on
 * the fly passages, the fixture MemoryBackend, seedCorpus), and there every text in which a panel name may be
 * readable is left out until the worker has written its chunks. showsPanelNames() is true for every text in
 * which the anonymizer's find_panel_members finds a name: such a name stands on a line that starts with a panel
 * label followed by a name, or below a line that holds a label alone. It is also true for some texts without a
 * readable name (a label followed by any upper case word), which only costs those records their on the fly
 * passages; closed source texts show "Başkan : [Hâkim 1]" and stay out of it.
 *
 * fixtures/kurul-satiri.json holds the two patterns; services/worker-py/nlp/tests/test_panel_names.py runs them
 * on the real AYM, Yargıtay and Danıştay decisions.
 */
export const PANEL_LINE =
  /^[ \t]*(?:Başkanvekilleri|Başkanvekili|Başkan|Üyeler|Üye|BAŞKANVEKİLLERİ|BAŞKANVEKİLİ|BAŞKAN|ÜYELER|ÜYE)[ \t]*:?[ \t]*(?:$|[A-ZÇĞİÖŞÜÂÎÛ])/u;

/** Every line break of Python's str.splitlines, so a line here never spans two lines there. */
// eslint-disable-next-line no-control-regex -- U+001C to U+001E are line breaks for str.splitlines
export const LINE_BREAK = /\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/u;

/** True when a panel member name may be readable in the text; such a text gets no passage cut in TypeScript. */
export function showsPanelNames(text: string): boolean {
  return text.split(LINE_BREAK).some((line) => PANEL_LINE.test(line));
}
