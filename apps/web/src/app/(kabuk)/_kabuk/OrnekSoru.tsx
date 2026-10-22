'use client';

/**
 * Sample question. While /ara is not open the link fills the home search box instead of pointing at a 404
 * (without JavaScript it jumps to the box). Once /ara ships it links to the results page.
 */
export function OrnekSoru({ soru, araAcik }: { soru: string; araAcik: boolean }) {
  if (araAcik) return <a href={`/ara?q=${encodeURIComponent(soru)}`}>{soru}</a>;
  return (
    <a
      href="#q"
      onClick={(e) => {
        const kutu = document.getElementById('q');
        if (!(kutu instanceof HTMLInputElement)) return;
        e.preventDefault();
        kutu.value = soru;
        kutu.focus();
      }}
    >
      {soru}
    </a>
  );
}
