import type { Language } from '@/context/AppContext';
function standardizeVisibleBrandCopy<T>(value: T): T {
  if (typeof value === 'string') {
    return value
      .replaceAll('Vigil — Know Where It All Goes', 'Vigil Spend')
      .replaceAll('Vigil Know Where It All Goes', 'Vigil Spend')
      .replaceAll('Vigil-Pro', 'Vigil Spend Pro')
      .replaceAll('Vigil Pro', 'Vigil Spend Pro')
      .replace(/\bVIGIL\b/g, 'Vigil Spend')
      .replace(/\bVigil\b(?!\s+Spend)/g, 'Vigil Spend') as T;
  }
  if (Array.isArray(value)) return value.map((item) => standardizeVisibleBrandCopy(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, standardizeVisibleBrandCopy(item)]),
    ) as T;
  }
  return value;
}

type TutorialStep = { title: string; copy: string };
const copies: Record<Language, TutorialStep[]> = {
  en: [
    { title: 'Log spending in seconds', copy: 'Tap Log spending to add a manual entry. Pro also unlocks receipt scans, bank messages, and voice notes.' },
    { title: 'Give income a plan', copy: 'Use Plan to add income and see how each bucket is doing. Bucket edits are available with Pro.' },
    { title: 'See the full picture', copy: 'History keeps your trail, while Analysis turns it into clear guidance with Vigil Pro.' },
  ],
  fr: [
    { title: 'Notez vos dépenses en quelques secondes', copy: 'Touchez Enregistrer une dépense pour ajouter une entrée. Pro déverrouille aussi les reçus, messages bancaires et notes vocales.' },
    { title: 'Donnez un plan à vos revenus', copy: 'Utilisez Plan pour ajouter vos revenus et suivre chaque enveloppe. Les modifications sont disponibles avec Pro.' },
    { title: 'Voyez l’ensemble', copy: 'Historique conserve vos traces et Analyse les transforme en repères clairs avec Vigil Pro.' },
  ],
  cs: [
    { title: 'Zapište výdaj během několika sekund', copy: 'Klepnutím na Zapsat výdaj přidáte ruční záznam. Pro odemkne také účtenky, bankovní zprávy a hlasové poznámky.' },
    { title: 'Dejte příjmu plán', copy: 'V části Plán přidejte příjem a sledujte jednotlivé kategorie. Úpravy kategorií jsou s Pro.' },
    { title: 'Uvidíte celý obraz', copy: 'Historie uchová vaše záznamy a Analýza je s Vigil Pro promění v jasné vodítko.' },
  ],
  de: [
    { title: 'Ausgaben in Sekunden erfassen', copy: 'Tippen Sie auf Ausgabe erfassen für einen manuellen Eintrag. Pro schaltet auch Belege, Banknachrichten und Sprachnotizen frei.' },
    { title: 'Geben Sie Ihrem Einkommen einen Plan', copy: 'Fügen Sie unter Plan Einkommen hinzu und sehen Sie, wie sich jede Kategorie entwickelt. Änderungen gibt es mit Pro.' },
    { title: 'Das ganze Bild sehen', copy: 'Der Verlauf bewahrt Ihre Einträge, während Analyse sie mit Vigil Pro in klare Hinweise verwandelt.' },
  ],
  es: [
    { title: 'Registra gastos en segundos', copy: 'Toca Registrar gasto para añadir una entrada manual. Pro también desbloquea recibos, mensajes bancarios y notas de voz.' },
    { title: 'Dale un plan a tus ingresos', copy: 'Usa Plan para añadir ingresos y ver cómo avanza cada categoría. Editarlas está disponible con Pro.' },
    { title: 'Mira el panorama completo', copy: 'Historial conserva tus registros y Análisis los convierte en orientación clara con Vigil Pro.' },
  ],
  ru: [
    { title: 'Записывайте расходы за секунды', copy: 'Нажмите «Записать расход», чтобы добавить запись. Pro также открывает чеки, банковские сообщения и голосовые заметки.' },
    { title: 'Составьте план доходов', copy: 'В разделе «План» добавляйте доход и следите за каждой категорией. Изменение категорий доступно в Pro.' },
    { title: 'Видьте всю картину', copy: 'История хранит записи, а Анализ превращает их в понятные подсказки с Vigil Pro.' },
  ],
  ar: [
    { title: 'سجّل إنفاقك خلال ثوانٍ', copy: 'اضغط على تسجيل الإنفاق لإضافة إدخال يدوي. يفتح Pro أيضاً مسح الإيصالات والرسائل البنكية والملاحظات الصوتية.' },
    { title: 'امنح دخلك خطة', copy: 'استخدم الخطة لإضافة الدخل ومعرفة أداء كل فئة. تعديل الفئات متاح مع Pro.' },
    { title: 'شاهد الصورة الكاملة', copy: 'يحفظ السجل خطواتك، بينما يحوّل التحليل هذه البيانات إلى إرشادات واضحة مع Vigil Pro.' },
  ],
};

export function tutorialCopy(language: Language) {
  return standardizeVisibleBrandCopy(copies[language] ?? copies.en);
}