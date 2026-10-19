import ortak from '@kazuist/i18n/tr/ortak.json';

export default function Home() {
  return (
    <main>
      <h1>{ortak.marka}</h1>
      <p>{ortak.uyari.danismanlik}</p>
    </main>
  );
}
