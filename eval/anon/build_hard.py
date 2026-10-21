"""Elle yazılmış ZOR örnek seti (Dalga 1 NER karşılaştırması için).

Dalga 1 raporunda kural katmanının kaçırdığı kalıplar (rol sözcüğü olmayan adlar, tamamı büyük harfli adlar,
"sanığın annesi", "Sosyal çalışma uzmanı") ve gerçek kararlarda sık görülen diğer zorluklar: liste halinde adlar,
ek almış soyadları, tek ad, baba ve ana adı, soyad önce yazım, baş harfler, yabancı ve tireli adlar, küçük harf
(OCR), ortak sözcük olan adlar. Olumsuz örnekler (kişi adı içeren yer, kurum ve kanun adları, adsız rol
sözcükleri) kesinliği ölçer.

Bütün adlar uydurmadır. Metinleri kuralları yazan ajan yazdı; set küçüktür ve iyimser olabilir. Kapı kanıtı
DEĞİLDİR (plan 6.7, 15.3/2). İşaretleme: [[P:ad]] kişi, [[A:adres]] adres, [[D:doğum tarihi]] doğum tarihi.

Kullanım (services/worker-py içinden): uv run python ../../eval/anon/build_hard.py  (çıktı eval/anon/zor)
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import List, Tuple

OUT = Path(__file__).with_name("zor")
CODES = {"P": "PERSON", "A": "ADDRESS", "D": "DOB"}
MARK = re.compile(r"\[\[([PAD]):(.+?)\]\]")

# (etiketler, işaretli metin)
DOCS: List[Tuple[List[str], str]] = [
    (["ipucusuz"], "Olay günü [[P:Kemal Sarıgül]] ile [[P:Hakan Ertürk]] arasında park yeri yüzünden tartışma "
                   "çıkmış, [[P:Sarıgül]] yere düşmüştür."),
    (["ipucusuz", "ek"], "Dosya kapsamına göre [[P:Nermin Ilıcalı]], [[P:Tarkan Özdağ]]'a ait aracı izinsiz "
                         "kullanmıştır. [[P:Özdağ]] şikâyetçi olmuştur."),
    (["akrabalik"], "Sanığın annesi [[P:Fadime Koçer]] ve ağabeyi [[P:Rıza Koçer]] duruşmada hazır bulunmuştur."),
    (["akrabalik"], "Davacının eşi [[P:Tülin Aksoylu]] ile kayınpederi [[P:Hamdi Aksoylu]] aynı evde "
                    "yaşamaktadır."),
    (["buyuk-harf"], "Müvekkil [[P:SERKAN DUMANLI]] adına vekâleten dava açılmıştır."),
    (["buyuk-harf", "baba-adi"], "SANIK : [[P:HÜSEYİN ÇAKIRBEY]], [[P:Ali]] oğlu, [[P:Hatice]]'den olma, "
                                 "[[D:03.05.1980]] doğumlu."),
    (["buyuk-harf"], "KATILAN : [[P:GÜLSÜM YAZICIOĞLU]]\nSANIK : [[P:ERDAL KÖSEOĞLU]]\nSUÇ : Kasten yaralama"),
    (["buyuk-harf", "ipucusuz", "ek"], "Mahkememizce [[P:İSMAİL HAKKI TOPÇUOĞLU]]'nun beyanına itibar "
                                       "edilmiştir."),
    (["meslek"], "Sosyal çalışma uzmanı [[P:Pelin Akarsu]] hazırladığı raporda çocuğun annesiyle kalmasını "
                 "önermiştir."),
    (["meslek"], "Zabıt kâtibi [[P:Oya Erten]] ve mübaşir [[P:Kenan Yurtsever]] hazır bulunmuştur."),
    (["meslek", "ek"], "Olay yerine gelen polis memuru [[P:Murat Kandemir]] tutanağı düzenlemiştir. Kolluk "
                       "görevlisi [[P:Kandemir]]'in beyanı tutanakla uyumludur."),
    (["meslek"], "İcra müdürü [[P:Sevda Karakum]] haciz tutanağını imzalamış, borçlu [[P:Nail Tepecik]] hazır "
                 "bulunmamıştır."),
    (["meslek"], "Uzman pedagog [[P:Banu Değirmenci]] ile psikolog [[P:Ozan Kirazlı]] görüşme yapmıştır."),
    (["liste"], "Tanıklar [[P:Seda Ateşoğlu]], [[P:Burak Ünlüsoy]] ve [[P:Gizem Tekinalp]] dinlenmiştir."),
    (["liste"], "Mirasçılar [[P:Halil Durmaz]], [[P:Saadet Durmaz]], [[P:Cengiz Durmaz]] ve [[P:Leyla Durmaz]] "
                "olup her biri dörtte bir payla hak sahibidir."),
    (["ek", "ipucusuz"], "[[P:Volkan Erdoğdu]]'nun ifadesi ile [[P:Neslihan Yalçınkaya]]'ya ait banka kayıtları "
                         "çelişmektedir. [[P:Erdoğdu]]'dan alınan para iade edilmemiştir."),
    (["tek-ad"], "Çocuk [[P:Ayşe]], annesinin yanında kalmak istediğini söylemiştir. [[P:Ayşe]]'nin okul durumu "
                 "iyidir."),
    (["tek-ad"], "Mağdur ifadesinde \"[[P:Cem]] bana vurdu, [[P:Tuncay]] da seyretti\" demiştir."),
    (["ortak-sozcuk"], "Tanık [[P:Deniz Yıldız]] olay günü deniz kenarında yürüdüğünü, havanın güneşli olduğunu "
                       "beyan etmiştir."),
    (["ortak-sozcuk"], "Davalı [[P:Umut Barış]], barış görüşmelerine katılmadığını ve umudunu kaybettiğini "
                       "belirtmiştir."),
    (["soyad-once", "buyuk-harf"], "Kayıtlarda adı [[P:YILMAZTÜRK Selçuk]] olarak geçen kişi ile "
                                   "[[P:Kayalı]], [[P:Nurhan]] aynı adreste oturmaktadır."),
    (["bas-harf"], "Sanık [[P:A.K.]] ile mağdur [[P:M.Ö.]] arasında önceye dayalı husumet bulunmaktadır."),
    (["yabanci"], "Davacı şirketin temsilcisi [[P:Maria Schneider]] ile tercüman [[P:John O'Neil]] duruşmaya "
                  "katılmıştır."),
    (["tire"], "Davacı [[P:Ayşe Yılmazer-Demirtaş]] soyadının düzeltilmesini talep etmiştir."),
    (["kucuk-harf"], "davacı [[P:ahmet tunalı]] ile davalı [[P:fikriye tunalı]] arasındaki boşanma davasında "
                     "tanık dinlenmemiştir."),
    (["uc-sozcuk", "ek"], "Bilirkişi heyetinden [[P:Mehmet Ali Gündoğar]] ile [[P:Fatma Zehra Kuşçu]]'nun ortak "
                          "raporu hükme esas alınmıştır."),
    (["imza"], "Başkan [[P:Ahmet Tevfik Sarıçam]] 34521\nÜye [[P:Selma Arıkoğlu]] 41236\nKâtip [[P:Nazlı Ertan]] "
               "120934"),
    (["ipucusuz", "ek"], "[[P:Selim Akgündüz]] iş yerinden çıktıktan sonra arkadaşı [[P:Oğuz Tanrıverdi]]'yi "
                         "aramış, birlikte [[P:Esra Bayındır]]'ın evine gitmişlerdir. [[P:Tanrıverdi]] ve "
                         "[[P:Bayındır]] olaydan haberdar olmadıklarını söylemişlerdir."),
    (["ipucusuz"], "Dinlenen [[P:Recep Ulusoy]] ve [[P:Hülya Ulusoy]] beyanlarında olay saatinde evde "
                   "olduklarını bildirmiştir."),
    (["buyuk-harf", "liste"], "TANIKLAR : [[P:BERRİN ÖZKÖK]], [[P:CAN ATILGAN]]"),
    (["ipucusuz"], "[[P:Ebru Sarıtaş]] tarafından gönderilen ihtarname davalıya tebliğ edilmiştir."),
    (["meslek"], "Dr. [[P:Kaan Erim]] tarafından düzenlenen raporda iyileşme süresi belirtilmiş, noter "
                 "[[P:Gönül Atasoy]] huzurunda düzenlenen vekâletname dosyaya sunulmuştur."),
    (["olumsuz"], "Taşınmaz [[A:Mehmet Akif Ersoy Mahallesi, 1203. Sokak No: 5]] Keçiören/Ankara adresindedir. "
                  "Araç Fatih Sultan Mehmet Köprüsü üzerinde, Atatürk Bulvarı istikametinde ilerlerken kaza "
                  "meydana gelmiştir."),
    (["olumsuz"], "Yargıtay 3. Hukuk Dairesinin 2021/1234 E. sayılı ilamı ile Türk Medeni Kanunu'nun 166. "
                  "maddesi uyarınca davanın kabulüne karar verilmiştir. Demirkol Lojistik A.Ş. ile Kaya Gıda "
                  "Ltd. Şti. davada taraf değildir."),
    (["olumsuz"], "Davacı vekili, davalı tarafın beyanlarına karşı süre istemiştir. Tanık beyanları "
                  "çelişkilidir. Bilirkişi raporu hükme esas alınmıştır. Hacettepe Üniversitesi Hastanesi ve "
                  "Adli Tıp Kurumu raporları dosyaya sunulmuştur."),
]


def parse(marked: str) -> Tuple[str, List[dict]]:
    parts: List[str] = []
    spans: List[dict] = []
    pos = 0
    last = 0
    for m in MARK.finditer(marked):
        parts.append(marked[last : m.start()])
        pos += m.start() - last
        value = m.group(2)
        spans.append({"start": pos, "end": pos + len(value), "entity": CODES[m.group(1)]})
        parts.append(value)
        pos += len(value)
        last = m.end()
    parts.append(marked[last:])
    return "".join(parts), spans


def generate() -> List[dict]:
    out = []
    for i, (tags, marked) in enumerate(DOCS, start=1):
        text, spans = parse(marked)
        out.append({"id": f"zor-{i:03d}", "kind": "zor", "synthetic": True, "handwritten": True, "tags": tags,
                    "text": text, "annotations_a": spans})
    return out


def main() -> int:
    OUT.mkdir(exist_ok=True)
    for p in OUT.glob("zor-*.json"):
        p.unlink()
    for d in generate():
        (OUT / f"{d['id']}.json").write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(DOCS)} belge yazıldı: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
