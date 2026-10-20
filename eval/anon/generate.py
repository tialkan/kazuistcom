"""SENTETİK altın set üreticisi (Dalga 1 başlangıç seti).

Bütün adlar, numaralar ve adresler uydurmadır; kimlik, vergi, IBAN ve kart numaraları yalnız kontrol
basamağı geçerli olacak biçimde rastgele üretilir ve hiçbir gerçek kişiye ait değildir. Bu set gerçek
karar metninin yerine geçmez; Dalga 3 kapısı 200 gerçek kararlık setle ölçülür (plan 6.7, 15.3/2).

Kullanım: uv run python ../../eval/anon/generate.py  (services/worker-py içinden; çıktı eval/anon/sentetik),
ardından kökte: pnpm exec prettier --write "eval/anon/**/*.json"
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services" / "worker-py"))

from anonymizer.checksums import iban_complete, luhn_complete, tckn_complete, vkn_complete  # noqa: E402

OUT = Path(__file__).with_name("sentetik")
SEED = 20261019

FIRST = ["Ayşe", "Mehmet", "Elif", "Mustafa", "Zeynep", "Ahmet", "Fatma", "Emre", "Selin", "Burak", "Derya",
         "Okan", "Gülşen", "Tolga", "Nihan", "Serkan", "İpek", "Cem", "Hülya", "Barış", "Şule", "Kerem", "Özge",
         "Yiğit", "Ebru", "Onur", "Sevgi", "Ufuk", "Melike", "Çağrı", "Dilan", "Levent", "Aslı", "Erdem", "Nur"]
LAST = ["Karaduman", "Yıldırımoğlu", "Akbulut", "Tezcan", "Erginer", "Sönmezler", "Kocabey", "Altınpınar",
        "Durukan", "Özbilge", "Gürsoylu", "Çetinkol", "Aydemirli", "Şahinalp", "Uluçay", "Bozdoğanlı",
        "Kılıçarslan", "Toprakçı", "Ertuğrul", "Yamaner", "Demirsoy", "Coşkunel", "Albayrakoğlu", "Ilgaz",
        "Sarıkaya", "Gökdemir", "Tunçel", "Evrenli", "Kayalıoğlu", "Öztekinler"]
NEIGH = ["Çiçekli", "Yeşiltepe", "Kavaklı", "Gülbahar", "Esentepe", "Karşıyaka", "Bahçelievler", "Yenidoğan"]
STREET = ["Menekşe", "Lale", "Ihlamur", "Defne", "Erguvan", "Söğüt", "Akasya", "Nergis"]
STREET_KIND = ["Sokak", "Caddesi", "Sk.", "Cad."]
CITY = [("Ankara", "Çankaya"), ("İstanbul", "Kadıköy"), ("İzmir", "Bornova"), ("Bursa", "Nilüfer"),
        ("Konya", "Selçuklu"), ("Antalya", "Muratpaşa")]
MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım",
          "Aralık"]
COURTS = ["Ankara 3. Asliye Hukuk Mahkemesi", "İstanbul Anadolu 5. Aile Mahkemesi", "İzmir 2. Ağır Ceza Mahkemesi",
          "Bursa 4. İş Mahkemesi", "Konya 1. Sulh Hukuk Mahkemesi", "Antalya 6. Asliye Ceza Mahkemesi"]
PLATE_LETTERS = ["AB", "KC", "TR", "M", "BN", "ZY", "PLE", "RS"]


class Doc:
    def __init__(self, doc_id: str, kind: str):
        self.id = doc_id
        self.kind = kind
        self.parts: list = []
        self.spans: list = []
        self.pos = 0

    def t(self, s: str) -> "Doc":
        self.parts.append(s)
        self.pos += len(s)
        return self

    def e(self, s: str, entity: str) -> "Doc":
        self.spans.append({"start": self.pos, "end": self.pos + len(s), "entity": entity})
        return self.t(s)

    def to_json(self) -> dict:
        text = "".join(self.parts)
        for sp in self.spans:
            assert text[sp["start"] : sp["end"]], sp
        return {"id": self.id, "kind": self.kind, "synthetic": True, "text": text, "annotations_a": self.spans}


class Gen:
    def __init__(self, seed: int):
        self.r = random.Random(seed)
        self.used: set = set()

    def name(self) -> str:
        while True:
            n = f"{self.r.choice(FIRST)} {self.r.choice(LAST)}"
            if n not in self.used:
                self.used.add(n)
                return n

    def tckn(self) -> str:
        return tckn_complete(str(self.r.randint(1, 9)) + "".join(str(self.r.randint(0, 9)) for _ in range(8)))

    def vkn(self) -> str:
        return vkn_complete("".join(str(self.r.randint(0, 9)) for _ in range(9)))

    def iban(self) -> str:
        bban = f"{self.r.randint(10, 99999):05d}0" + "".join(str(self.r.randint(0, 9)) for _ in range(16))
        raw = iban_complete("TR", bban)
        return " ".join(raw[i : i + 4] for i in range(0, len(raw), 4))

    def card(self) -> str:
        raw = luhn_complete("4" + "".join(str(self.r.randint(0, 9)) for _ in range(14)))
        return " ".join(raw[i : i + 4] for i in range(0, 16, 4))

    def phone(self) -> str:
        n = f"5{self.r.randint(30, 59)} {self.r.randint(100, 999)} {self.r.randint(10, 99)} {self.r.randint(10, 99)}"
        return self.r.choice(["0", "+90 ", "0 "]) + n

    def email(self, name: str) -> str:
        tr = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
        a, b = name.translate(tr).lower().split()
        return f"{a}.{b}{self.r.randint(1, 99)}@ornekposta.test"

    def address(self) -> str:
        return (f"{self.r.choice(NEIGH)} Mahallesi, {self.r.choice(STREET)} {self.r.choice(STREET_KIND)} "
                f"No: {self.r.randint(1, 120)}/{self.r.randint(1, 20)}")

    def date(self, y0: int, y1: int, words: bool = False) -> str:
        d, m, y = self.r.randint(1, 28), self.r.randint(1, 12), self.r.randint(y0, y1)
        return f"{d} {MONTHS[m - 1]} {y}" if words else f"{d:02d}.{m:02d}.{y}"

    def plate(self) -> str:
        return f"{self.r.randint(1, 81):02d} {self.r.choice(PLATE_LETTERS)} {self.r.randint(10, 9999)}"

    def case_no(self) -> str:
        return f"E. {self.r.randint(2019, 2025)}/{self.r.randint(10, 999)} K. {self.r.randint(2020, 2026)}/{self.r.randint(10, 999)}"


def hukuk(g: Gen, d: Doc) -> None:
    court = g.r.choice(COURTS[:1] + COURTS[4:5])
    davaci, davali, vekil, bilirkisi, tanik1, tanik2 = (g.name() for _ in range(6))
    city, town = g.r.choice(CITY)
    d.t(f"T.C. {court}\n{g.case_no()}\n\nDAVACI : ").e(davaci, "PERSON").t(" (T.C. kimlik no: ").e(g.tckn(), "TCKN")
    d.t(")\nAdres : ").e(g.address(), "ADDRESS").t(f" {town}/{city}\nVEKİLİ : Av. ").e(vekil, "PERSON")
    d.t("\nDAVALI : ").e(davali, "PERSON").t("\n\nDavacı vekili Av. ").e(vekil, "PERSON")
    d.t(" dava dilekçesinde, müvekkili ").e(davaci, "PERSON").t(" ile davalı ").e(davali, "PERSON")
    d.t(f" arasında {g.date(2019, 2023, True)} tarihinde kira sözleşmesi kurulduğunu, kira bedelinin ")
    d.e(g.iban(), "IBAN").t(" numaralı hesaba yatırılması gerektiğini ileri sürmüştür. Davalı ile ")
    d.e(g.phone(), "PHONE").t(" numaralı telefon ve ").e(g.email(davali), "EMAIL")
    d.t(" adresi üzerinden yazışıldığı anlaşılmıştır. Taşınmaz ").e(
        f"{g.r.randint(100, 9999)} ada {g.r.randint(1, 99)} parsel", "PARCEL")
    d.t(" sayılı yerde bulunmaktadır.\n\nMahkememizce görevlendirilen bilirkişi ").e(bilirkisi, "PERSON")
    d.t(" raporunda kira bedelinin emsallere uygun olduğunu bildirmiştir. Tanık ").e(tanik1, "PERSON")
    d.t(" beyanında taşınmazın boş olduğunu, tanık ").e(tanik2, "PERSON").t(" ise davalının taşınmazda oturduğunu ")
    d.t("beyan etmiştir. Tanık ").e(tanik1.split()[1], "PERSON").t(" beyanı dosya kapsamıyla örtüşmektedir.\n\n")
    d.t("HÜKÜM: Davanın kabulüne, davalı ").e(davali, "PERSON").t(" tarafından davacıya ödeme yapılmasına karar verildi.")


def ceza(g: Gen, d: Doc) -> None:
    court = g.r.choice(COURTS[2:3] + COURTS[5:6])
    s1, s2, magdur, tanik, mudafi, hakim = (g.name() for _ in range(6))
    d.t(f"T.C. {court}\n{g.case_no()}\n\nHâkim : ").e(hakim, "PERSON").t("\nSANIK : ").e(s1, "PERSON")
    d.t(", ").e(g.date(1975, 2000), "DOB").t(" doğumlu, T.C. kimlik no ").e(g.tckn(), "TCKN")
    d.t("\nSANIK : ").e(s2, "PERSON").t(", doğum tarihi: ").e(g.date(1970, 2001), "DOB")
    d.t("\nMÜDAFİİ : Av. ").e(mudafi, "PERSON").t("\nMAĞDUR : ").e(magdur, "PERSON")
    d.t(f"\n\nİddianamede, sanık ").e(s1, "PERSON").t(f" yönetimindeki ").e(g.plate(), "PLATE")
    d.t(f" plakalı araçla {g.date(2021, 2024, True)} tarihinde mağdur ").e(magdur, "PERSON")
    d.t("'a çarptığı, sanık ").e(s2, "PERSON").t("'ın olay yerinden ayrıldığı anlatılmıştır. Mağdurun ")
    d.e(g.r.choice(["epilepsi", "diyabet", "depresyon"]), "HEALTH").t(" tanısıyla tedavi gördüğü raporla sabittir. ")
    d.t("Tanık ").e(tanik, "PERSON").t(" olayı gördüğünü beyan etmiştir. Sanık ").e(s1.split()[1], "PERSON")
    d.t("'in ").e("adli sicil kaydında", "CRIMINAL").t(" kasıtlı suçtan mahkûmiyet bulunmamaktadır.\n\n")
    d.t("HÜKÜM: Sanık ").e(s1, "PERSON").t(" hakkında hükmün açıklanmasının geri bırakılmasına karar verildi.")


def aile(g: Gen, d: Doc) -> None:
    court = COURTS[1]
    davaci, davali, cocuk, vekil, uzman = (g.name() for _ in range(5))
    cocuk_first = cocuk.split()[0]
    surname = davaci.split()[1]
    cocuk = f"{cocuk_first} {surname}"
    school = f"{g.r.choice(STREET)} İlkokulu"
    d.t(f"T.C. {court}\n{g.case_no()}\n\nDAVACI : ").e(davaci, "PERSON").t("\nVEKİLİ : Av. ").e(vekil, "PERSON")
    d.t("\nDAVALI : ").e(davali, "PERSON").t("\n\nTarafların müşterek çocuğu ").e(cocuk, "PERSON")
    d.t(" ").e(f"{g.r.randint(6, 12)} yaşında", "CHILD_AGE").t(" olup ").e(school, "SCHOOL")
    d.t(" öğrencisidir. Sosyal çalışma uzmanı ").e(uzman, "PERSON").t(" raporunda çocuğun annesiyle kalmasının ")
    d.t("yararına olduğunu bildirmiştir. Davalı ").e(davali, "PERSON").t(" ile davacı ").e(davaci, "PERSON")
    d.t(" ortak ev adresi olan ").e(g.address(), "ADDRESS").t(" adresinden ayrılmıştır. Davalının ")
    d.e(g.phone(), "PHONE").t(" numaralı telefonundan gönderilen mesajlar dosyaya sunulmuştur.\n\n")
    d.t("HÜKÜM: Müşterek çocuk ").e(cocuk, "PERSON").t(" üzerindeki velayetin davacıya verilmesine karar verildi.")


def is_davasi(g: Gen, d: Doc) -> None:
    court = COURTS[3]
    davaci, isveren, vekil, tanik = (g.name() for _ in range(4))
    d.t(f"T.C. {court}\n{g.case_no()}\n\nDAVACI : ").e(davaci, "PERSON").t(" (T.C. kimlik no: ").e(g.tckn(), "TCKN")
    d.t(")\nVEKİLİ : Av. ").e(vekil, "PERSON").t("\nDAVALI : ").e(isveren, "SOLE_PROPRIETOR")
    d.t(" İnşaat, vergi kimlik no ").e(g.vkn(), "VKN").t("\n\nDavacı ").e(davaci, "PERSON")
    d.t(" davalıya ait şantiyede çalıştığını, ücretinin ").e(g.card(), "CARD")
    d.t(" numaralı karta yatırıldığını, ").e("sendika üyesi", "UNION").t(" olduğu için iş akdinin feshedildiğini ")
    d.t("ileri sürmüştür. Tanık ").e(tanik, "PERSON").t(" davacının ").e(g.email(davaci), "EMAIL")
    d.t(" adresine ihtarname gönderildiğini doğrulamıştır.\n\n")
    d.t("HÜKÜM: Davanın kısmen kabulüne karar verildi.")


KINDS = [("hukuk", hukuk), ("ceza", ceza), ("aile", aile), ("is", is_davasi)]


def generate(n: int = 50, seed: int = SEED) -> list:
    g = Gen(seed)
    docs = []
    for i in range(n):
        kind, fn = KINDS[i % len(KINDS)]
        d = Doc(f"sentetik-{i + 1:03d}", kind)
        fn(g, d)
        docs.append(d.to_json())
    return docs


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    for doc in generate():
        (OUT / f"{doc['id']}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(list(OUT.glob('*.json')))} belge yazıldı: {OUT}")


if __name__ == "__main__":
    main()
