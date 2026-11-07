// The 404 page's own words, in the site's language.
//
// It was English on every site, so an Arabic site answered a mistyped link
// with "This page doesn't exist" — the one page certain to be seen by someone
// who is already a little lost. There is no translation system for the
// theme's handful of fixed strings, so this is a small table: the languages
// the language picker offers most often, English for everything else.

export interface NotFoundText {
  title: string;
  body: string;
  search: string;
  placeholder: string;
  home: string;
}

const TEXT: Record<string, NotFoundText> = {
  en: { title: "This page doesn't exist", body: "The link may be out of date, or the page may have moved.", search: "Search", placeholder: "Search the site…", home: "Go home" },
  ar: { title: "هذه الصفحة غير موجودة", body: "ربما يكون الرابط قديمًا، أو نُقلت الصفحة إلى مكان آخر.", search: "بحث", placeholder: "ابحث في الموقع…", home: "العودة إلى الرئيسية" },
  fr: { title: "Cette page n'existe pas", body: "Le lien est peut-être obsolète, ou la page a été déplacée.", search: "Rechercher", placeholder: "Rechercher sur le site…", home: "Retour à l'accueil" },
  es: { title: "Esta página no existe", body: "Puede que el enlace esté desactualizado o que la página se haya movido.", search: "Buscar", placeholder: "Buscar en el sitio…", home: "Ir al inicio" },
  pt: { title: "Esta página não existe", body: "O link pode estar desatualizado ou a página pode ter sido movida.", search: "Pesquisar", placeholder: "Pesquisar no site…", home: "Ir para o início" },
  de: { title: "Diese Seite existiert nicht", body: "Der Link ist möglicherweise veraltet, oder die Seite wurde verschoben.", search: "Suchen", placeholder: "Website durchsuchen…", home: "Zur Startseite" },
  it: { title: "Questa pagina non esiste", body: "Il link potrebbe essere obsoleto, oppure la pagina è stata spostata.", search: "Cerca", placeholder: "Cerca nel sito…", home: "Torna alla home" },
  tr: { title: "Bu sayfa mevcut değil", body: "Bağlantı eskimiş olabilir veya sayfa taşınmış olabilir.", search: "Ara", placeholder: "Sitede ara…", home: "Ana sayfaya dön" },
  ru: { title: "Такой страницы нет", body: "Возможно, ссылка устарела или страница была перемещена.", search: "Найти", placeholder: "Поиск по сайту…", home: "На главную" },
  ur: { title: "یہ صفحہ موجود نہیں ہے", body: "ہو سکتا ہے لنک پرانا ہو، یا صفحہ کہیں اور منتقل ہو گیا ہو۔", search: "تلاش", placeholder: "سائٹ میں تلاش کریں…", home: "ہوم پیج پر جائیں" },
  fa: { title: "این صفحه وجود ندارد", body: "ممکن است پیوند قدیمی باشد یا صفحه جابه‌جا شده باشد.", search: "جستجو", placeholder: "جستجو در سایت…", home: "بازگشت به صفحه اصلی" },
  hi: { title: "यह पेज मौजूद नहीं है", body: "हो सकता है लिंक पुराना हो, या पेज कहीं और चला गया हो।", search: "खोजें", placeholder: "साइट में खोजें…", home: "होम पेज पर जाएँ" },
  id: { title: "Halaman ini tidak ada", body: "Tautannya mungkin sudah usang, atau halamannya telah dipindahkan.", search: "Cari", placeholder: "Cari di situs…", home: "Ke beranda" },
  nl: { title: "Deze pagina bestaat niet", body: "De link is mogelijk verouderd, of de pagina is verplaatst.", search: "Zoeken", placeholder: "Zoek op de site…", home: "Naar de homepage" },
  pl: { title: "Ta strona nie istnieje", body: "Link może być nieaktualny lub strona została przeniesiona.", search: "Szukaj", placeholder: "Szukaj w serwisie…", home: "Wróć na stronę główną" },
  uk: { title: "Цієї сторінки не існує", body: "Можливо, посилання застаріло або сторінку переміщено.", search: "Пошук", placeholder: "Пошук по сайту…", home: "На головну" },
  cs: { title: "Tato stránka neexistuje", body: "Odkaz může být zastaralý nebo byla stránka přesunuta.", search: "Hledat", placeholder: "Hledat na webu…", home: "Zpět domů" },
  el: { title: "Αυτή η σελίδα δεν υπάρχει", body: "Ο σύνδεσμος μπορεί να είναι παλιός ή η σελίδα να μετακινήθηκε.", search: "Αναζήτηση", placeholder: "Αναζήτηση στον ιστότοπο…", home: "Επιστροφή στην αρχική" },
  ro: { title: "Această pagină nu există", body: "Linkul poate fi învechit sau pagina a fost mutată.", search: "Caută", placeholder: "Caută pe site…", home: "Înapoi acasă" },
  hu: { title: "Ez az oldal nem létezik", body: "Lehet, hogy a hivatkozás elavult, vagy az oldal átkerült.", search: "Keresés", placeholder: "Keresés az oldalon…", home: "Vissza a főoldalra" },
  sv: { title: "Den här sidan finns inte", body: "Länken kan vara inaktuell, eller så har sidan flyttats.", search: "Sök", placeholder: "Sök på webbplatsen…", home: "Till startsidan" },
  da: { title: "Denne side findes ikke", body: "Linket er måske forældet, eller siden er flyttet.", search: "Søg", placeholder: "Søg på webstedet…", home: "Til forsiden" },
  nb: { title: "Denne siden finnes ikke", body: "Lenken kan være utdatert, eller siden kan ha blitt flyttet.", search: "Søk", placeholder: "Søk på nettstedet…", home: "Til forsiden" },
  fi: { title: "Tätä sivua ei ole", body: "Linkki voi olla vanhentunut tai sivu on siirretty.", search: "Haku", placeholder: "Hae sivustolta…", home: "Etusivulle" },
  he: { title: "העמוד הזה לא קיים", body: "ייתכן שהקישור ישן או שהעמוד הועבר.", search: "חיפוש", placeholder: "חפש באתר…", home: "לדף הבית" },
  ja: { title: "このページは存在しません", body: "リンクが古いか、ページが移動した可能性があります。", search: "検索", placeholder: "サイト内を検索…", home: "ホームへ" },
  ko: { title: "이 페이지는 존재하지 않습니다", body: "링크가 오래되었거나 페이지가 이동했을 수 있습니다.", search: "검색", placeholder: "사이트 검색…", home: "홈으로" },
  vi: { title: "Trang này không tồn tại", body: "Liên kết có thể đã cũ hoặc trang đã được chuyển.", search: "Tìm kiếm", placeholder: "Tìm kiếm trên trang…", home: "Về trang chủ" },
  th: { title: "ไม่มีหน้านี้", body: "ลิงก์อาจล้าสมัย หรือหน้านี้อาจถูกย้าย", search: "ค้นหา", placeholder: "ค้นหาในเว็บไซต์…", home: "กลับหน้าแรก" },
  ms: { title: "Halaman ini tidak wujud", body: "Pautan mungkin sudah lapuk, atau halaman telah dipindahkan.", search: "Cari", placeholder: "Cari dalam laman…", home: "Ke laman utama" },
  fil: { title: "Wala ang pahinang ito", body: "Maaaring luma na ang link, o inilipat na ang pahina.", search: "Maghanap", placeholder: "Maghanap sa site…", home: "Bumalik sa home" },
  sw: { title: "Ukurasa huu haupo", body: "Kiungo kinaweza kuwa cha zamani, au ukurasa umehamishwa.", search: "Tafuta", placeholder: "Tafuta kwenye tovuti…", home: "Nenda mwanzo" },
  bn: { title: "এই পাতাটি নেই", body: "লিঙ্কটি পুরনো হতে পারে, বা পাতাটি সরিয়ে নেওয়া হয়েছে।", search: "খুঁজুন", placeholder: "সাইটে খুঁজুন…", home: "হোমে যান" },
  ps: { title: "دا پاڼه شتون نه لري", body: "کېدای شي لینک زوړ وي، یا پاڼه بل ځای ته لېږدول شوې وي.", search: "لټون", placeholder: "په سایټ کې لټون…", home: "کور پاڼې ته ستنېدل" },
  pa: { title: "ਇਹ ਪੰਨਾ ਮੌਜੂਦ ਨਹੀਂ ਹੈ", body: "ਹੋ ਸਕਦਾ ਹੈ ਲਿੰਕ ਪੁਰਾਣਾ ਹੋਵੇ, ਜਾਂ ਪੰਨਾ ਕਿਤੇ ਹੋਰ ਚਲਾ ਗਿਆ ਹੋਵੇ।", search: "ਖੋਜੋ", placeholder: "ਸਾਈਟ 'ਤੇ ਖੋਜੋ…", home: "ਮੁੱਖ ਪੰਨੇ 'ਤੇ ਜਾਓ" },
  ta: { title: "இந்தப் பக்கம் இல்லை", body: "இணைப்பு பழையதாக இருக்கலாம், அல்லது பக்கம் வேறு இடத்திற்கு நகர்த்தப்பட்டிருக்கலாம்.", search: "தேடு", placeholder: "தளத்தில் தேடு…", home: "முகப்புக்குச் செல்" },
  te: { title: "ఈ పేజీ లేదు", body: "లింక్ పాతది కావచ్చు, లేదా పేజీ వేరే చోటికి మార్చబడి ఉండవచ్చు.", search: "వెతకండి", placeholder: "సైట్‌లో వెతకండి…", home: "హోమ్‌కు వెళ్ళండి" },
  mr: { title: "हे पान अस्तित्वात नाही", body: "दुवा जुना असू शकतो, किंवा पान दुसरीकडे हलवले गेले असू शकते.", search: "शोधा", placeholder: "साइटवर शोधा…", home: "मुख्यपृष्ठावर जा" },
  gu: { title: "આ પાનું અસ્તિત્વમાં નથી", body: "લિંક જૂની હોઈ શકે છે, અથવા પાનું બીજે ખસેડાયું હોઈ શકે છે.", search: "શોધો", placeholder: "સાઇટમાં શોધો…", home: "હોમ પર જાઓ" },
  kn: { title: "ಈ ಪುಟ ಅಸ್ತಿತ್ವದಲ್ಲಿಲ್ಲ", body: "ಲಿಂಕ್ ಹಳೆಯದಾಗಿರಬಹುದು, ಅಥವಾ ಪುಟವನ್ನು ಬೇರೆಡೆಗೆ ಸರಿಸಲಾಗಿರಬಹುದು.", search: "ಹುಡುಕಿ", placeholder: "ಸೈಟ್‌ನಲ್ಲಿ ಹುಡುಕಿ…", home: "ಮುಖಪುಟಕ್ಕೆ ಹೋಗಿ" },
  ml: { title: "ഈ പേജ് നിലവിലില്ല", body: "ലിങ്ക് പഴയതാകാം, അല്ലെങ്കിൽ പേജ് മറ്റൊരിടത്തേക്ക് മാറ്റിയിരിക്കാം.", search: "തിരയുക", placeholder: "സൈറ്റിൽ തിരയുക…", home: "ഹോമിലേക്ക് പോകുക" },
  ne: { title: "यो पृष्ठ अवस्थित छैन", body: "लिङ्क पुरानो हुन सक्छ, वा पृष्ठ अन्यत्र सारिएको हुन सक्छ।", search: "खोज्नुहोस्", placeholder: "साइटमा खोज्नुहोस्…", home: "गृहपृष्ठमा जानुहोस्" },
  si: { title: "මෙම පිටුව නොපවතී", body: "සබැඳිය යල් පැන ගිය එකක් විය හැකිය, නැතහොත් පිටුව වෙනත් තැනකට ගෙන ගොස් ඇත.", search: "සොයන්න", placeholder: "අඩවියේ සොයන්න…", home: "මුල් පිටුවට යන්න" },
};

/** The 404 wording for a language tag (`ar`, `ar-EG`), English when there is none. */
export function notFoundText(language: string): NotFoundText {
  return TEXT[language] ?? TEXT[language.split("-")[0].toLowerCase()] ?? TEXT.en;
}

/**
 * The same, for the screen a visitor gets when a render throws.
 *
 * The 404 has been translated since it was written; the 500 beside it was
 * English on every site, which is the wrong moment to stop speaking someone's
 * language. The boundary is a client component with no settings and no params,
 * so it reads `<html lang>` — which the layout has already set from the
 * document's own language — and looks the words up here.
 */
export interface ErrorText {
  title: string;
  body: string;
  retry: string;
  home: string;
}

const ERROR: Record<string, ErrorText> = {
  en: { title: "Something went wrong", body: "This page failed to load. Trying again often fixes it — if it doesn't, the problem is on our side.", retry: "Try again", home: "Go home" },
  ar: { title: "حدث خطأ ما", body: "تعذّر تحميل هذه الصفحة. غالبًا ما تنجح المحاولة مرة أخرى — وإن لم تنجح فالمشكلة لدينا.", retry: "حاول مرة أخرى", home: "العودة إلى الرئيسية" },
  fr: { title: "Une erreur est survenue", body: "Cette page n'a pas pu se charger. Réessayer suffit souvent — sinon, le problème vient de nous.", retry: "Réessayer", home: "Retour à l'accueil" },
  es: { title: "Algo ha ido mal", body: "Esta página no se ha podido cargar. Reintentar suele bastar; si no, el problema es nuestro.", retry: "Reintentar", home: "Ir al inicio" },
  pt: { title: "Algo correu mal", body: "Esta página não carregou. Tentar de novo costuma resolver — se não, o problema é nosso.", retry: "Tentar de novo", home: "Ir para o início" },
  de: { title: "Da ist etwas schiefgelaufen", body: "Diese Seite konnte nicht geladen werden. Ein erneuter Versuch hilft meistens — sonst liegt es an uns.", retry: "Erneut versuchen", home: "Zur Startseite" },
  it: { title: "Qualcosa è andato storto", body: "Questa pagina non si è caricata. Riprovare di solito basta; altrimenti il problema è nostro.", retry: "Riprova", home: "Torna alla home" },
  tr: { title: "Bir şeyler ters gitti", body: "Bu sayfa yüklenemedi. Tekrar denemek çoğu zaman yeterli olur — olmazsa sorun bizde.", retry: "Tekrar dene", home: "Ana sayfaya dön" },
  ru: { title: "Что-то пошло не так", body: "Страница не загрузилась. Обычно помогает повторная попытка — если нет, проблема на нашей стороне.", retry: "Повторить", home: "На главную" },
  ur: { title: "کچھ غلط ہو گیا", body: "یہ صفحہ لوڈ نہیں ہو سکا۔ دوبارہ کوشش کرنے سے اکثر ٹھیک ہو جاتا ہے — ورنہ مسئلہ ہماری طرف ہے۔", retry: "دوبارہ کوشش کریں", home: "ہوم پیج پر جائیں" },
  fa: { title: "مشکلی پیش آمد", body: "این صفحه بارگذاری نشد. تلاش دوباره معمولاً کافی است — در غیر این صورت مشکل از ماست.", retry: "تلاش دوباره", home: "بازگشت به صفحه اصلی" },
  hi: { title: "कुछ गलत हो गया", body: "यह पेज लोड नहीं हो सका। दोबारा कोशिश करने से अक्सर ठीक हो जाता है — नहीं तो समस्या हमारी ओर है।", retry: "फिर कोशिश करें", home: "होम पेज पर जाएँ" },
  id: { title: "Ada yang salah", body: "Halaman ini gagal dimuat. Mencoba lagi biasanya berhasil — kalau tidak, masalahnya ada di kami.", retry: "Coba lagi", home: "Ke beranda" },
  ps: { title: "یوه ستونزه رامنځته شوه", body: "دا پاڼه پورته نه شوه. بیا هڅه اکثره ستونزه حلوي — که نه، ستونزه زموږ په لوري ده.", retry: "بیا هڅه وکړئ", home: "کور پاڼې ته ستنېدل" },
  pa: { title: "ਕੁਝ ਗਲਤ ਹੋ ਗਿਆ", body: "ਇਹ ਪੰਨਾ ਲੋਡ ਨਹੀਂ ਹੋ ਸਕਿਆ। ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰਨ ਨਾਲ ਅਕਸਰ ਠੀਕ ਹੋ ਜਾਂਦਾ ਹੈ — ਜੇ ਨਹੀਂ, ਤਾਂ ਸਮੱਸਿਆ ਸਾਡੇ ਵੱਲੋਂ ਹੈ।", retry: "ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ", home: "ਮੁੱਖ ਪੰਨੇ 'ਤੇ ਜਾਓ" },
  ta: { title: "ஏதோ தவறு நடந்துவிட்டது", body: "இந்தப் பக்கம் ஏற்றப்படவில்லை. மீண்டும் முயன்றால் பெரும்பாலும் சரியாகும் — இல்லையெனில், பிரச்சனை எங்கள் பக்கம்.", retry: "மீண்டும் முயல்க", home: "முகப்புக்குச் செல்" },
  te: { title: "ఏదో తప్పు జరిగింది", body: "ఈ పేజీ లోడ్ కాలేదు. మళ్లీ ప్రయత్నిస్తే తరచుగా సరిపోతుంది — లేకపోతే, సమస్య మా వైపు ఉంది.", retry: "మళ్లీ ప్రయత్నించండి", home: "హోమ్‌కు వెళ్ళండి" },
  mr: { title: "काहीतरी चुकले", body: "हे पान लोड होऊ शकले नाही. पुन्हा प्रयत्न केल्यास बहुधा ठीक होते — नाही झाल्यास, अडचण आमच्या बाजूने आहे.", retry: "पुन्हा प्रयत्न करा", home: "मुख्यपृष्ठावर जा" },
  gu: { title: "કંઈક ખોટું થયું", body: "આ પાનું લોડ થઈ શક્યું નથી. ફરી પ્રયાસ કરવાથી મોટે ભાગે ઠીક થઈ જાય છે — નહીં તો, સમસ્યા અમારી બાજુએ છે.", retry: "ફરી પ્રયાસ કરો", home: "હોમ પર જાઓ" },
  kn: { title: "ಏನೋ ತಪ್ಪಾಗಿದೆ", body: "ಈ ಪುಟ ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿದರೆ ಹೆಚ್ಚಾಗಿ ಸರಿಯಾಗುತ್ತದೆ — ಇಲ್ಲದಿದ್ದರೆ, ಸಮಸ್ಯೆ ನಮ್ಮ ಕಡೆಯಿಂದ ಇದೆ.", retry: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ", home: "ಮುಖಪುಟಕ್ಕೆ ಹೋಗಿ" },
  ml: { title: "എന്തോ പിശക് സംഭവിച്ചു", body: "ഈ പേജ് ലോഡ് ചെയ്യാനായില്ല. വീണ്ടും ശ്രമിച്ചാൽ മിക്കപ്പോഴും ശരിയാകും — ഇല്ലെങ്കിൽ, പ്രശ്നം ഞങ്ങളുടെ ഭാഗത്താണ്.", retry: "വീണ്ടും ശ്രമിക്കുക", home: "ഹോമിലേക്ക് പോകുക" },
  ne: { title: "केही गडबड भयो", body: "यो पृष्ठ लोड हुन सकेन। फेरि प्रयास गर्दा प्रायः ठीक हुन्छ — भएन भने, समस्या हाम्रो तर्फबाट हो।", retry: "फेरि प्रयास गर्नुहोस्", home: "गृहपृष्ठमा जानुहोस्" },
  si: { title: "යමක් වැරදී ඇත", body: "මෙම පිටුව පූරණය කිරීමට නොහැකි විය. නැවත උත්සාහ කිරීමෙන් බොහෝ විට විසඳේ — නැතහොත්, ගැටලුව අපගේ පැත්තෙනි.", retry: "නැවත උත්සාහ කරන්න", home: "මුල් පිටුවට යන්න" },
};

/** The error screen's wording for a language tag, English when there is none. */
export function errorText(language: string): ErrorText {
  return ERROR[language] ?? ERROR[(language || "").split("-")[0].toLowerCase()] ?? ERROR.en;
}
