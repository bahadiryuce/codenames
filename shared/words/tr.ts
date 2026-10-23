// Turkish word pack. Lowercase display forms, grouped by tag. Words are single common
// nouns, at most 11 letters, chosen to support associations; many are deliberately
// ambiguous (yüz, dil, kale, yaz, çay, gül, at, yay, koç, akrep, ocak, pazar...).
// Run `npm run words:check` after editing: it rejects duplicates, folded collisions
// and malformed entries.

export const TR_WORDS: Record<string, string> = {
  hayvan: `
    kedi köpek aslan kaplan fil zürafa kartal baykuş yarasa yılan kurbağa kaplumbağa
    balina yunus ahtapot penguen deve at eşek inek koyun keçi horoz ördek
    kaz kuğu papağan karga güvercin arı karınca örümcek kelebek sinek akrep timsah
    maymun ayı kurt tilki tavşan sincap fare kirpi geyik zebra gergedan kanguru panda
    leopar yengeç istakoz salyangoz solucan kertenkele dinozor tırtıl çekirge leylek
    pelikan flamingo martı serçe şahin akbaba boğa koç hindi tavuk balık midye
  `,
  doga: `
    dağ deniz göl nehir orman çöl ada mağara volkan şelale buzul kum taş kaya toprak
    çamur yağmur kar dolu fırtına şimşek gökkuşağı rüzgar bulut sis güneş ay yıldız
    gezegen ağaç çiçek gül lale papatya yaprak kök tohum ot yosun mantar diken kaktüs
    palmiye meşe söğüt vadi tepe uçurum pınar kaynak dalga mercan inci deprem çığ
    sel bahar kış yaz gece sabah akşam şafak duman kül alev ateş buz buhar kömür vaha
    boğaz körfez yamaç
  `,
  yer: `
    okul hastane müze kütüphane kale saray tapınak köprü kule liman havalimanı istasyon
    pazar çarşı fırın otel kamp tiyatro sinema stadyum hapishane fabrika çiftlik bahçe
    park sirk hamam banka mutfak bodrum çatı balkon koridor asansör merdiven tünel kuyu
    kavşak meydan sokak mahalle köy şehir ülke kıta sınır gümrük laboratuvar ofis
    mağaza eczane karakol plaj havuz zindan şato kervan otogar
  `,
  yiyecek: `
    ekmek peynir zeytin bal reçel çay kahve süt yoğurt ayran tereyağı yumurta et pilav
    makarna çorba salata pizza hamburger dondurma çikolata şeker tuz biber limon
    portakal elma armut muz üzüm çilek kiraz karpuz kavun ananas nar incir ceviz fındık
    fıstık badem kestane domates patates soğan sarımsak havuç patlıcan kabak lahana
    ıspanak bezelye fasulye mercimek nohut pirinç un baklava lokum simit börek kebap
    köfte dolma helva pasta kurabiye bisküvi sucuk turşu sirke hardal mısır tarçın
    nane kekik vanilya
  `,
  nesne: `
    masa sandalye kanepe yatak yastık battaniye halı perde ayna lamba mum saat anahtar
    kilit kapı pencere duvar zil telefon bilgisayar ekran klavye kamera televizyon
    radyo hoparlör pil kablo makas iğne iplik düğme fermuar çanta cüzdan
    bavul şemsiye gözlük şapka eldiven atkı çorap ayakkabı çizme terlik kemer kravat
    yüzük kolye küpe taç kılıç kalkan ok yay mızrak top zar kart para altın gümüş
    bakır demir elmas zümrüt yakut kristal cam kağıt kalem silgi defter kitap dergi
    gazete mektup zarf pul harita pusula dürbün teleskop mikroskop büyüteç terazi
    cetvel tebeşir tahta fırça boya tuval heykel vazo testi kova süpürge sabun havlu
    tarak bıçak çatal kaşık tabak bardak fincan tencere tava termos şişe kavanoz kutu
    sandık kafes zincir halat ip çivi çekiç tornavida testere vida balta kürek çadır
    fener dümen çapa yelken bayrak düdük davul gitar keman piyano flüt saz çan trompet
    akordeon mikrofon maske kukla balon bilet sepet paket hediye takvim musluk ocak
    küvet salıncak kaydırak hamak tablet çip mühür madalya kupa taht anten kalıp çark
    bant düğüm nota sayfa kurşun bomba tuzak kapan buzdolabı
  `,
  ulasim: `
    araba otobüs tren uçak gemi tekne bisiklet motosiklet kamyon taksi tramvay metro
    helikopter roket denizaltı yat kayık sal kızak paraşüt füze tank traktör ambulans
    vagon tekerlek direksiyon fren motor korna
  `,
  bilim: `
    atom molekül hücre gen virüs bakteri mıknatıs elektrik enerji ışık ses lazer robot
    uydu radar internet şifre program yazılım veri sinyal frekans formül deney teori
    galaksi uzay meteor yörünge evrim fosil iskelet beyin kalp kan damar kemik kas mide
    böbrek göz kulak burun ağız dil diş el ayak parmak tırnak saç sakal bıyık omuz diz
    dirsek boyun bel yüz alın kol topuk çene kafa çekirdek kabuk zırh kod ağ yazıcı
    tarayıcı mumya piramit
  `,
  insan: `
    doktor hemşire öğretmen polis asker pilot aşçı garson berber terzi çiftçi 
    avcı korsan şövalye kral kraliçe prens sultan vezir hakim avukat mühendis
    mimar ressam şair yazar oyuncu sihirbaz cadı dev melek hayalet
    vampir ninja dedektif hırsız palyaço astronot kaptan bekçi kasap bahçıvan 
    çoban dalgıç cerrah muhtar hoca usta çırak bebek dede çocuk kahraman düşman dost
    komşu misafir yabancı aile firavun imparator elçi hakem
  `,
  kultur: `
    film müzik dans şarkı şiir masal efsane destan opera bale konser festival düğün
    bayram parti karnaval kostüm satranç tavla dama domino bulmaca futbol basketbol
    tenis golf kayak boks güreş maraton takım sahne alkış marş ordu devrim seçim oy
    haber sınav ders tatil vize pasaport kimlik posta kargo fatura kuyruk sıra not
    hazine harf alfabe
  `,
  soyut: `
    aşk sevgi nefret korku cesaret umut hayal rüya anı zaman özgürlük adalet barış savaş
    zafer şans kader sır yalan gerçek fikir akıl ruh onur sabır öfke hız güç denge düzen
    kaos sihir mucize tehlike güven merak hafıza bilgi zeka kural ceza ödül borç vergi
    yasa görev plan hedef iz gölge yankı koku renk boşluk son gelecek geçmiş an hafta
    yıl mevsim tarih bağ yaş kara sağ sol pas çizgi nokta daire kare üçgen küp hat ızgara
    labirent dünya cennet macera rekor
  `,
};
