// The theme's fixed words, in the site's language — the listing's, and the
// post title area's breadcrumb and card rows.
//
// The card grid was written in English on every site: an Arabic blog listed
// "1 post", "By Hussnain", "Read more →" and "No posts published yet." under
// an Arabic heading. Same reasoning and same shape as notFoundText — there is
// no translation system for the theme's fixed strings, so this is a small
// table of the languages the picker offers most often, English for the rest.
//
// `posts` takes the count because the plural rule differs per language; the
// table keeps it simple (one form and a many form), which is right for the
// languages here and never wrong enough to read as a mistake.

import { counted, type PluralForms } from "./plural";

export interface ArchiveText {
  posts: (n: number) => string;
  /** Pagination. The arrows are written by the component, not here: a label
   *  translates, but "previous" points the other way in a right-to-left page. */
  prev: string;
  next: string;
  pagination: string;
  pageOf: (page: number, total: number) => string;
  by: string;
  readMore: string;
  /** The "everything" chip above the grid, and the filter row's landmark. */
  all: string;
  categories: string;
  /** Defaults for the two labels the Customizer can also set — see siteExtras. */
  minRead: string;
  loadMore: string;
  /** The post title area: its breadcrumb's first crumb, and the X card's rows. */
  home: string;
  writtenBy: string;
  timeToRead: string;
  /** What follows a post: its tags, the previous/next pair, the related list. */
  tagged: string;
  previous: string;
  nextPost: string;
  relatedPosts: string;
  empty: string;
  emptyPage: string;
}

/** A row of the table: like ArchiveText, but holding the word's forms rather
 *  than a function, because the function needs the language to pick one. */
type ArchiveEntry = Omit<ArchiveText, "posts"> & { postForms: PluralForms };

const t = (
  postForms: PluralForms,
  pageOf: (p: number, t: number) => string,
  by: string,
  readMore: string,
  empty: string,
  emptyPage: string,
  prev: string,
  next: string,
  pagination: string,
  all: string,
  categories: string,
  minRead: string,
  loadMore: string,
  home: string,
  writtenBy: string,
  timeToRead: string,
  tagged: string,
  previous: string,
  nextPost: string,
  relatedPosts: string
): ArchiveEntry => ({
  postForms,
  pageOf,
  by,
  readMore,
  empty,
  emptyPage,
  prev,
  next,
  pagination,
  all,
  categories,
  minRead,
  loadMore,
  home,
  writtenBy,
  timeToRead,
  tagged,
  previous,
  nextPost,
  relatedPosts,
});

const TEXT: Record<string, ArchiveEntry> = {
  en: t({ one: "post", other: "posts" }, (p, n) => ` · page ${p} of ${n}`, "By", "Read more", "No posts published yet.", "Nothing on this page.", "Previous", "Next", "Pagination", "All", "Categories", "min read", "Load more", "Home", "Written by", "Time to read", "Tagged", "Previous", "Next", "Related Posts"),
  ar: t({ zero: "مقالات", one: "مقال", two: "مقالان", few: "مقالات", many: "مقالًا", other: "مقال" }, (p, n) => ` · صفحة ${p} من ${n}`, "بقلم", "اقرأ المزيد", "لا توجد مقالات منشورة بعد.", "لا يوجد شيء في هذه الصفحة.", "السابق", "التالي", "ترقيم الصفحات", "الكل", "التصنيفات", "دقيقة قراءة", "تحميل المزيد", "الرئيسية", "بقلم", "وقت القراءة", "الوسوم", "السابق", "التالي", "مقالات ذات صلة"),
  fr: t({ one: "article", other: "articles" }, (p, n) => ` · page ${p} sur ${n}`, "Par", "Lire la suite", "Aucun article publié pour le moment.", "Rien sur cette page.", "Précédent", "Suivant", "Pagination", "Tout", "Catégories", "min de lecture", "Charger plus", "Accueil", "Écrit par", "Temps de lecture", "Étiquettes", "Précédent", "Suivant", "Articles similaires"),
  es: t({ one: "entrada", other: "entradas" }, (p, n) => ` · página ${p} de ${n}`, "Por", "Leer más", "Todavía no hay entradas publicadas.", "No hay nada en esta página.", "Anterior", "Siguiente", "Paginación", "Todo", "Categorías", "min de lectura", "Cargar más", "Inicio", "Escrito por", "Tiempo de lectura", "Etiquetas", "Anterior", "Siguiente", "Entradas relacionadas"),
  pt: t({ one: "artigo", other: "artigos" }, (p, n) => ` · página ${p} de ${n}`, "Por", "Ler mais", "Ainda não há artigos publicados.", "Não há nada nesta página.", "Anterior", "Próximo", "Paginação", "Tudo", "Categorias", "min de leitura", "Carregar mais", "Início", "Escrito por", "Tempo de leitura", "Etiquetas", "Anterior", "Próximo", "Artigos relacionados"),
  de: t({ one: "Beitrag", other: "Beiträge" }, (p, n) => ` · Seite ${p} von ${n}`, "Von", "Weiterlesen", "Noch keine Beiträge veröffentlicht.", "Auf dieser Seite ist nichts.", "Zurück", "Weiter", "Seitennummerierung", "Alle", "Kategorien", "Min. Lesezeit", "Mehr laden", "Startseite", "Geschrieben von", "Lesezeit", "Schlagwörter", "Zurück", "Weiter", "Ähnliche Beiträge"),
  it: t({ one: "articolo", other: "articoli" }, (p, n) => ` · pagina ${p} di ${n}`, "Di", "Leggi di più", "Nessun articolo pubblicato finora.", "Niente in questa pagina.", "Precedente", "Successivo", "Impaginazione", "Tutto", "Categorie", "min di lettura", "Carica altro", "Home", "Scritto da", "Tempo di lettura", "Etichette", "Precedente", "Successivo", "Articoli correlati"),
  tr: t({ one: "yazı", other: "yazı" }, (p, n) => ` · sayfa ${p} / ${n}`, "Yazan", "Devamını oku", "Henüz yayımlanmış yazı yok.", "Bu sayfada bir şey yok.", "Önceki", "Sonraki", "Sayfalama", "Tümü", "Kategoriler", "dk okuma", "Daha fazla yükle", "Ana sayfa", "Yazan", "Okuma süresi", "Etiketler", "Önceki", "Sonraki", "İlgili yazılar"),
  ru: t({ one: "запись", few: "записи", many: "записей", other: "записи" }, (p, n) => ` · страница ${p} из ${n}`, "Автор", "Читать далее", "Пока нет опубликованных записей.", "На этой странице ничего нет.", "Назад", "Вперёд", "Постраничная навигация", "Все", "Категории", "мин чтения", "Показать ещё", "Главная", "Автор", "Время чтения", "Метки", "Назад", "Вперёд", "Похожие записи"),
  ur: t({ one: "مضمون", other: "مضامین" }, (p, n) => ` · صفحہ ${p} از ${n}`, "بقلم", "مزید پڑھیں", "ابھی تک کوئی مضمون شائع نہیں ہوا۔", "اس صفحے پر کچھ نہیں ہے۔", "پچھلا", "اگلا", "صفحہ بندی", "سب", "زمرے", "منٹ کا مطالعہ", "مزید لوڈ کریں", "ہوم", "تحریر", "مطالعے کا وقت", "ٹیگز", "پچھلا", "اگلا", "متعلقہ مضامین"),
  fa: t({ one: "نوشته", other: "نوشته" }, (p, n) => ` · صفحه ${p} از ${n}`, "نویسنده", "ادامه مطلب", "هنوز نوشته‌ای منتشر نشده است.", "چیزی در این صفحه نیست.", "قبلی", "بعدی", "صفحه‌بندی", "همه", "دسته‌ها", "دقیقه مطالعه", "بارگذاری بیشتر", "خانه", "نوشتهٔ", "زمان مطالعه", "برچسب‌ها", "قبلی", "بعدی", "نوشته‌های مرتبط"),
  hi: t({ one: "लेख", other: "लेख" }, (p, n) => ` · पेज ${p} / ${n}`, "लेखक", "और पढ़ें", "अभी तक कोई लेख प्रकाशित नहीं हुआ।", "इस पेज पर कुछ नहीं है।", "पिछला", "अगला", "पेजिनेशन", "सभी", "श्रेणियाँ", "मिनट पढ़ें", "और लोड करें", "होम", "लेखक", "पढ़ने का समय", "टैग", "पिछला", "अगला", "संबंधित लेख"),
  id: t({ one: "artikel", other: "artikel" }, (p, n) => ` · halaman ${p} dari ${n}`, "Oleh", "Baca selengkapnya", "Belum ada artikel yang diterbitkan.", "Tidak ada apa pun di halaman ini.", "Sebelumnya", "Berikutnya", "Paginasi", "Semua", "Kategori", "menit baca", "Muat lebih banyak", "Beranda", "Ditulis oleh", "Waktu baca", "Tag", "Sebelumnya", "Berikutnya", "Artikel terkait"),
  nl: t({ one: "bericht", other: "berichten" }, (p, n) => ` · pagina ${p} van ${n}`, "Door", "Lees meer", "Nog geen berichten gepubliceerd.", "Niets op deze pagina.", "Vorige", "Volgende", "Paginering", "Alles", "Categorieën", "min lezen", "Meer laden", "Home", "Geschreven door", "Leestijd", "Tags", "Vorige", "Volgende", "Gerelateerde berichten"),
  pl: t({ one: "artykuł", few: "artykuły", many: "artykułów", other: "artykułu" }, (p, n) => ` · strona ${p} z ${n}`, "Autor", "Czytaj więcej", "Nie opublikowano jeszcze żadnych artykułów.", "Nic na tej stronie.", "Poprzednia", "Następna", "Paginacja", "Wszystko", "Kategorie", "min czytania", "Wczytaj więcej", "Strona główna", "Napisane przez", "Czas czytania", "Tagi", "Poprzedni", "Następny", "Podobne artykuły"),
  uk: t({ one: "запис", few: "записи", many: "записів", other: "запису" }, (p, n) => ` · сторінка ${p} з ${n}`, "Автор", "Читати далі", "Ще немає опублікованих записів.", "На цій сторінці нічого немає.", "Назад", "Далі", "Навігація сторінками", "Усе", "Категорії", "хв читання", "Показати більше", "Головна", "Автор", "Час читання", "Мітки", "Попередній", "Наступний", "Схожі записи"),
  cs: t({ one: "článek", few: "články", many: "článku", other: "článků" }, (p, n) => ` · strana ${p} z ${n}`, "Autor", "Číst dál", "Zatím nebyly publikovány žádné články.", "Na této stránce nic není.", "Předchozí", "Další", "Stránkování", "Vše", "Kategorie", "min čtení", "Načíst další", "Domů", "Napsal", "Doba čtení", "Štítky", "Předchozí", "Další", "Související články"),
  el: t({ one: "άρθρο", other: "άρθρα" }, (p, n) => ` · σελίδα ${p} από ${n}`, "Από", "Διαβάστε περισσότερα", "Δεν έχουν δημοσιευθεί ακόμη άρθρα.", "Δεν υπάρχει τίποτα σε αυτή τη σελίδα.", "Προηγούμενη", "Επόμενη", "Σελιδοποίηση", "Όλα", "Κατηγορίες", "λεπτά ανάγνωσης", "Φόρτωση περισσότερων", "Αρχική", "Γράφτηκε από", "Χρόνος ανάγνωσης", "Ετικέτες", "Προηγούμενο", "Επόμενο", "Σχετικά άρθρα"),
  ro: t({ one: "articol", few: "articole", other: "de articole" }, (p, n) => ` · pagina ${p} din ${n}`, "De", "Citește mai mult", "Nu a fost publicat niciun articol încă.", "Nimic pe această pagină.", "Anterior", "Următor", "Paginare", "Toate", "Categorii", "min de citit", "Încarcă mai multe", "Acasă", "Scris de", "Timp de citire", "Etichete", "Anterior", "Următor", "Articole similare"),
  hu: t({ other: "bejegyzés" }, (p, n) => ` · ${n}. oldalból ${p}.`, "Szerző", "Tovább olvasom", "Még nincs közzétett bejegyzés.", "Ezen az oldalon nincs semmi.", "Előző", "Következő", "Lapozás", "Összes", "Kategóriák", "perc olvasás", "Több betöltése", "Főoldal", "Írta", "Olvasási idő", "Címkék", "Előző", "Következő", "Kapcsolódó bejegyzések"),
  sv: t({ one: "inlägg", other: "inlägg" }, (p, n) => ` · sida ${p} av ${n}`, "Av", "Läs mer", "Inga inlägg har publicerats än.", "Inget på den här sidan.", "Föregående", "Nästa", "Sidnumrering", "Alla", "Kategorier", "min läsning", "Ladda fler", "Hem", "Skriven av", "Lästid", "Etiketter", "Föregående", "Nästa", "Relaterade inlägg"),
  da: t({ one: "indlæg", other: "indlæg" }, (p, n) => ` · side ${p} af ${n}`, "Af", "Læs mere", "Der er endnu ikke udgivet nogen indlæg.", "Intet på denne side.", "Forrige", "Næste", "Sidenummerering", "Alle", "Kategorier", "min læsning", "Indlæs flere", "Forside", "Skrevet af", "Læsetid", "Tags", "Forrige", "Næste", "Relaterede indlæg"),
  nb: t({ one: "innlegg", other: "innlegg" }, (p, n) => ` · side ${p} av ${n}`, "Av", "Les mer", "Ingen innlegg er publisert ennå.", "Ingenting på denne siden.", "Forrige", "Neste", "Sidenummerering", "Alle", "Kategorier", "min lesing", "Last inn flere", "Hjem", "Skrevet av", "Lesetid", "Stikkord", "Forrige", "Neste", "Relaterte innlegg"),
  fi: t({ one: "artikkeli", other: "artikkelia" }, (p, n) => ` · sivu ${p} / ${n}`, "Kirjoittaja", "Lue lisää", "Artikkeleita ei ole vielä julkaistu.", "Tällä sivulla ei ole mitään.", "Edellinen", "Seuraava", "Sivutus", "Kaikki", "Kategoriat", "min lukuaika", "Lataa lisää", "Etusivu", "Kirjoittanut", "Lukuaika", "Tunnisteet", "Edellinen", "Seuraava", "Aiheeseen liittyvät"),
  he: t({ one: "פוסט", two: "פוסטים", other: "פוסטים" }, (p, n) => ` · עמוד ${p} מתוך ${n}`, "מאת", "קרא עוד", "טרם פורסמו פוסטים.", "אין כלום בעמוד זה.", "הקודם", "הבא", "עמודים", "הכל", "קטגוריות", "דקות קריאה", "טען עוד", "בית", "נכתב על ידי", "זמן קריאה", "תגיות", "הקודם", "הבא", "פוסטים קשורים"),
  ja: t({ other: "件の記事" }, (p, n) => ` · ${n} ページ中 ${p} ページ目`, "著者", "続きを読む", "まだ公開された記事はありません。", "このページには何もありません。", "前へ", "次へ", "ページ送り", "すべて", "カテゴリー", "分で読めます", "もっと読み込む", "ホーム", "執筆", "読了時間", "タグ", "前の記事", "次の記事", "関連記事"),
  ko: t({ other: "개의 글" }, (p, n) => ` · ${n}페이지 중 ${p}페이지`, "작성자", "더 읽기", "아직 게시된 글이 없습니다.", "이 페이지에는 아무것도 없습니다.", "이전", "다음", "페이지 매김", "전체", "카테고리", "분 소요", "더 보기", "홈", "작성", "읽는 시간", "태그", "이전 글", "다음 글", "관련 글"),
  vi: t({ other: "bài viết" }, (p, n) => ` · trang ${p} trên ${n}`, "Bởi", "Đọc tiếp", "Chưa có bài viết nào được đăng.", "Không có gì ở trang này.", "Trước", "Sau", "Phân trang", "Tất cả", "Chuyên mục", "phút đọc", "Tải thêm", "Trang chủ", "Viết bởi", "Thời gian đọc", "Thẻ", "Trước", "Sau", "Bài viết liên quan"),
  th: t({ other: "บทความ" }, (p, n) => ` · หน้า ${p} จาก ${n}`, "โดย", "อ่านต่อ", "ยังไม่มีบทความที่เผยแพร่", "ไม่มีอะไรในหน้านี้", "ก่อนหน้า", "ถัดไป", "แบ่งหน้า", "ทั้งหมด", "หมวดหมู่", "นาทีในการอ่าน", "โหลดเพิ่ม", "หน้าแรก", "เขียนโดย", "เวลาอ่าน", "แท็ก", "ก่อนหน้า", "ถัดไป", "บทความที่เกี่ยวข้อง"),
  ms: t({ other: "artikel" }, (p, n) => ` · halaman ${p} daripada ${n}`, "Oleh", "Baca lagi", "Belum ada artikel diterbitkan.", "Tiada apa-apa di halaman ini.", "Sebelumnya", "Seterusnya", "Penomboran", "Semua", "Kategori", "min bacaan", "Muat lagi", "Laman utama", "Ditulis oleh", "Masa membaca", "Tag", "Sebelumnya", "Seterusnya", "Artikel berkaitan"),
  fil: t({ one: "post", other: "na post" }, (p, n) => ` · pahina ${p} ng ${n}`, "Ni", "Magbasa pa", "Wala pang nailathalang post.", "Walang laman ang pahinang ito.", "Nakaraan", "Susunod", "Paghahati sa pahina", "Lahat", "Mga kategorya", "min na pagbasa", "Mag-load pa", "Home", "Isinulat ni", "Oras ng pagbasa", "Mga tag", "Nakaraan", "Susunod", "Kaugnay na mga post"),
  sw: t({ one: "chapisho", other: "machapisho" }, (p, n) => ` · ukurasa ${p} kati ya ${n}`, "Na", "Soma zaidi", "Bado hakuna machapisho yaliyochapishwa.", "Hakuna kitu kwenye ukurasa huu.", "Iliyotangulia", "Inayofuata", "Kurasa", "Zote", "Kategoria", "dakika za kusoma", "Pakia zaidi", "Mwanzo", "Imeandikwa na", "Muda wa kusoma", "Lebo", "Iliyotangulia", "Inayofuata", "Machapisho yanayohusiana"),
  bn: t({ one: "টি পোস্ট", other: "টি পোস্ট" }, (p, n) => ` · পাতা ${p} / ${n}`, "লিখেছেন", "আরও পড়ুন", "এখনও কোনো পোস্ট প্রকাশিত হয়নি।", "এই পাতায় কিছু নেই।", "পূর্ববর্তী", "পরবর্তী", "পৃষ্ঠাসংখ্যা", "সব", "বিভাগ", "মিনিট পড়া", "আরও দেখুন", "হোম", "লিখেছেন", "পড়ার সময়", "ট্যাগ", "পূর্ববর্তী", "পরবর্তী", "সম্পর্কিত পোস্ট"),
  ps: t({ one: "لیکنه", other: "لیکنې" }, (p, n) => ` · پاڼه ${p} له ${n}`, "لیکوال", "نور ولولئ", "تر اوسه هېڅ لیکنه نه ده خپره شوې.", "په دې پاڼه کې هېڅ نشته.", "مخکینی", "بل", "پاڼه بندي", "ټول", "کټګورۍ", "دقیقې لوستل", "نور وښایاست", "کور", "لیکوال", "د لوستلو وخت", "ټګونه", "مخکینۍ", "بله", "اړوندې لیکنې"),
  pa: t({ one: "ਪੋਸਟ", other: "ਪੋਸਟਾਂ" }, (p, n) => ` · ਪੰਨਾ ${p} / ${n}`, "ਲੇਖਕ", "ਹੋਰ ਪੜ੍ਹੋ", "ਹਾਲੇ ਕੋਈ ਪੋਸਟ ਪ੍ਰਕਾਸ਼ਿਤ ਨਹੀਂ ਹੋਈ।", "ਇਸ ਪੰਨੇ 'ਤੇ ਕੁਝ ਨਹੀਂ ਹੈ।", "ਪਿਛਲਾ", "ਅਗਲਾ", "ਪੰਨਾ ਨੰਬਰ", "ਸਾਰੇ", "ਸ਼੍ਰੇਣੀਆਂ", "ਮਿੰਟ ਪੜ੍ਹਨ ਦਾ ਸਮਾਂ", "ਹੋਰ ਲੋਡ ਕਰੋ", "ਮੁੱਖ ਪੰਨਾ", "ਲੇਖਕ", "ਪੜ੍ਹਨ ਦਾ ਸਮਾਂ", "ਟੈਗ", "ਪਿਛਲੀ", "ਅਗਲੀ", "ਸੰਬੰਧਿਤ ਪੋਸਟਾਂ"),
  ta: t({ one: "பதிவு", other: "பதிவுகள்" }, (p, n) => ` · பக்கம் ${p} / ${n}`, "எழுதியவர்", "மேலும் படிக்க", "இதுவரை எந்தப் பதிவும் வெளியிடப்படவில்லை.", "இந்தப் பக்கத்தில் எதுவும் இல்லை.", "முந்தைய", "அடுத்த", "பக்க எண்ணிடல்", "அனைத்தும்", "வகைகள்", "நிமிட வாசிப்பு", "மேலும் ஏற்று", "முகப்பு", "எழுதியவர்", "வாசிப்பு நேரம்", "குறிச்சொற்கள்", "முந்தைய", "அடுத்த", "தொடர்புடைய பதிவுகள்"),
  te: t({ one: "పోస్ట్", other: "పోస్ట్‌లు" }, (p, n) => ` · పేజీ ${p} / ${n}`, "రచయిత", "ఇంకా చదవండి", "ఇంకా ఏ పోస్ట్‌లూ ప్రచురించబడలేదు.", "ఈ పేజీలో ఏమీ లేదు.", "మునుపటి", "తదుపరి", "పేజీల విభజన", "అన్నీ", "వర్గాలు", "నిమిషాల పఠనం", "మరిన్ని లోడ్ చేయండి", "హోమ్", "రచయిత", "చదవడానికి పట్టే సమయం", "ట్యాగ్‌లు", "మునుపటి", "తదుపరి", "సంబంధిత పోస్ట్‌లు"),
  mr: t({ one: "लेख", other: "लेख" }, (p, n) => ` · पान ${p} / ${n}`, "लेखक", "अधिक वाचा", "अद्याप कोणताही लेख प्रकाशित झालेला नाही.", "या पानावर काहीही नाही.", "मागील", "पुढील", "पृष्ठांकन", "सर्व", "वर्ग", "मिनिटांचे वाचन", "अधिक लोड करा", "मुख्यपृष्ठ", "लेखक", "वाचनाचा वेळ", "टॅग", "मागील", "पुढील", "संबंधित लेख"),
  gu: t({ one: "પોસ્ટ", other: "પોસ્ટ" }, (p, n) => ` · પાનું ${p} / ${n}`, "લેખક", "વધુ વાંચો", "હજી સુધી કોઈ પોસ્ટ પ્રકાશિત થઈ નથી.", "આ પાના પર કંઈ નથી.", "પાછલું", "આગળ", "પાનાં ક્રમાંકન", "બધું", "શ્રેણીઓ", "મિનિટ વાંચન", "વધુ લોડ કરો", "હોમ", "લેખક", "વાંચનનો સમય", "ટૅગ્સ", "પાછલી", "આગલી", "સંબંધિત પોસ્ટ્સ"),
  kn: t({ one: "ಲೇಖನ", other: "ಲೇಖನಗಳು" }, (p, n) => ` · ಪುಟ ${p} / ${n}`, "ಲೇಖಕರು", "ಇನ್ನಷ್ಟು ಓದಿ", "ಇನ್ನೂ ಯಾವುದೇ ಲೇಖನ ಪ್ರಕಟವಾಗಿಲ್ಲ.", "ಈ ಪುಟದಲ್ಲಿ ಏನೂ ಇಲ್ಲ.", "ಹಿಂದಿನ", "ಮುಂದಿನ", "ಪುಟ ವಿಂಗಡಣೆ", "ಎಲ್ಲಾ", "ವರ್ಗಗಳು", "ನಿಮಿಷದ ಓದು", "ಇನ್ನಷ್ಟು ಲೋಡ್ ಮಾಡಿ", "ಮುಖಪುಟ", "ಬರೆದವರು", "ಓದುವ ಸಮಯ", "ಟ್ಯಾಗ್‌ಗಳು", "ಹಿಂದಿನ", "ಮುಂದಿನ", "ಸಂಬಂಧಿತ ಲೇಖನಗಳು"),
  ml: t({ one: "പോസ്റ്റ്", other: "പോസ്റ്റുകൾ" }, (p, n) => ` · പേജ് ${p} / ${n}`, "എഴുതിയത്", "കൂടുതൽ വായിക്കുക", "ഇതുവരെ പോസ്റ്റുകളൊന്നും പ്രസിദ്ധീകരിച്ചിട്ടില്ല.", "ഈ പേജിൽ ഒന്നുമില്ല.", "മുമ്പത്തെ", "അടുത്തത്", "പേജിനേഷൻ", "എല്ലാം", "വിഭാഗങ്ങൾ", "മിനിറ്റ് വായന", "കൂടുതൽ ലോഡ് ചെയ്യുക", "ഹോം", "എഴുതിയത്", "വായനാ സമയം", "ടാഗുകൾ", "മുമ്പത്തെ", "അടുത്തത്", "ബന്ധപ്പെട്ട പോസ്റ്റുകൾ"),
  ne: t({ one: "लेख", other: "लेखहरू" }, (p, n) => ` · पृष्ठ ${p} / ${n}`, "लेखक", "थप पढ्नुहोस्", "अहिलेसम्म कुनै लेख प्रकाशित भएको छैन।", "यो पृष्ठमा केही छैन।", "अघिल्लो", "अर्को", "पृष्ठ क्रम", "सबै", "वर्गहरू", "मिनेट पढाइ", "थप लोड गर्नुहोस्", "गृहपृष्ठ", "लेखक", "पढ्ने समय", "ट्यागहरू", "अघिल्लो", "अर्को", "सम्बन्धित लेखहरू"),
  si: t({ one: "ලිපිය", other: "ලිපි" }, (p, n) => ` · පිටුව ${p} / ${n}`, "ලියූයේ", "තවත් කියවන්න", "තවමත් ලිපි කිසිවක් පළ කර නැත.", "මෙම පිටුවේ කිසිවක් නැත.", "පෙර", "ඊළඟ", "පිටු අංකනය", "සියල්ල", "ප්‍රවර්ග", "මිනිත්තු කියවීම", "තවත් පූරණය කරන්න", "මුල් පිටුව", "ලියූයේ", "කියවීමට ගතවන කාලය", "ටැග්", "පෙර", "ඊළඟ", "අදාළ ලිපි"),
};

/** The archive wording for a language tag (`ar`, `ar-EG`), English when there is none. */
export function archiveText(language: string): ArchiveText {
  const base = (language || "").split("-")[0].toLowerCase();
  // The plural rule has to match the words, not the request: a Polish site
  // that falls back to English wording needs English's rule, or it would ask
  // Polish's three-form rule for words that only have two.
  const key = TEXT[language] ? language : TEXT[base] ? base : "en";
  const entry = TEXT[key];
  const { postForms, ...rest } = entry;
  return { ...rest, posts: (n) => counted(key, n, postForms) };
}
