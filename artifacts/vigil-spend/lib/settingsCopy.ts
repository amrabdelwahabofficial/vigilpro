import type { Language } from '@/context/AppContext';
import { standardizeVisibleBrandCopy } from '@/lib/brand';

type SettingsCopy = {
  yourPlan: string;
  proUnlocked: string;
  freeClarity: string;
  freeFeatures: string[];
  proFeatures: string[];
  restoreTitle: string;
  restoreSuccess: string;
  restoreNone: string;
  restoreError: string;
  adminMode: string;
  taxEstimate: (percent: number) => string;
  noTaxBucket: string;
  morningReminderCopy: string;
  eveningReminderCopy: string;
  signInMethods: string;
  adminLabel: string;
  signingOut: string;
};

const en: SettingsCopy = {
  yourPlan: 'Your Vigil plan', proUnlocked: 'Every feature is unlocked.', freeClarity: 'Simple daily clarity, always free.',
  freeFeatures: ['Manual spending logs', 'Income and bucket planning', 'Recent transaction history'],
  proFeatures: ['Voice, receipt, and screenshot capture', 'Country-aware tax planning and currencies', 'Full Analysis reports and bucket insights'],
  restoreTitle: 'Restore purchases', restoreSuccess: 'Vigil Pro restored.', restoreNone: 'No active Vigil Pro purchase was found for this Apple ID.', restoreError: 'Restore purchases could not be completed. Please try again.',
  adminMode: 'Admin testing mode is active. Pro capture and analysis are available without a purchase.',
  taxEstimate: (percent) => `A ${percent}% planning estimate is reserved in Tax. Adjust this bucket for your actual situation.`,
  noTaxBucket: 'No personal income-tax bucket is shown for this country.',
  morningReminderCopy: '8:00 AM · Log before life gets loud.',
  eveningReminderCopy: '8:30 PM · Close the loop with kindness.',
  signInMethods: ' · Google or email',
  adminLabel: 'Admin',
  signingOut: 'Signing out…',
};

const translations: Record<Exclude<Language, 'en'>, SettingsCopy> = {
  fr: { ...en, yourPlan: 'Votre plan Vigil', proUnlocked: 'Toutes les fonctionnalités sont déverrouillées.', freeClarity: 'Une clarté quotidienne, toujours gratuite.', freeFeatures: ['Saisie manuelle des dépenses', 'Planification des revenus et enveloppes', 'Historique récent des transactions'], proFeatures: ['Capture vocale, reçus et captures d’écran', 'Planification fiscale et devises selon le pays', 'Rapports et analyses complets'], restoreTitle: 'Restaurer les achats', restoreSuccess: 'Vigil Pro a été restauré.', restoreNone: 'Aucun achat Vigil Pro actif trouvé pour cet identifiant Apple.', restoreError: 'La restauration a échoué. Réessayez.', adminMode: 'Le mode test administrateur est actif. La capture Pro et l’analyse sont disponibles sans achat.', taxEstimate: (percent) => `Une estimation de ${percent}% est réservée dans Impôts. Ajustez cette enveloppe selon votre situation.`, noTaxBucket: 'Aucune enveloppe d’impôt sur le revenu n’est affichée pour ce pays.', morningReminderCopy: '08:00 · Notez vos dépenses avant que la journée ne commence.', eveningReminderCopy: '20:30 · Terminez la journée avec bienveillance.', signInMethods: ' · Google ou e-mail', adminLabel: 'Administration', signingOut: 'Déconnexion…' },
  cs: { ...en, yourPlan: 'Váš plán Vigil', proUnlocked: 'Všechny funkce jsou odemčené.', freeClarity: 'Každodenní přehled, vždy zdarma.', freeFeatures: ['Ruční záznamy výdajů', 'Plánování příjmů a kategorií', 'Nedávná historie transakcí'], proFeatures: ['Hlasové záznamy, účtenky a snímky', 'Daňové plánování a měny podle země', 'Úplné přehledy a analýzy'], restoreTitle: 'Obnovit nákupy', restoreSuccess: 'Vigil Pro byl obnoven.', restoreNone: 'Pro toto Apple ID nebyl nalezen aktivní nákup Vigil Pro.', restoreError: 'Nákupy se nepodařilo obnovit. Zkuste to znovu.', adminMode: 'Je aktivní testovací režim administrátora. Funkce Pro jsou dostupné bez nákupu.', taxEstimate: (percent) => `V daních je vyčleněn odhad ${percent}%. Upravte kategorii podle své situace.`, noTaxBucket: 'Pro tuto zemi se osobní daňová kategorie nezobrazuje.', morningReminderCopy: '08:00 · Zapište výdaj, než začne den.', eveningReminderCopy: '20:30 · Uzavřete den s klidem.', signInMethods: ' · Google nebo e-mail', adminLabel: 'Administrátor', signingOut: 'Odhlašování…' },
  de: { ...en, yourPlan: 'Ihr Vigil-Plan', proUnlocked: 'Alle Funktionen sind freigeschaltet.', freeClarity: 'Tägliche Klarheit, immer kostenlos.', freeFeatures: ['Manuelle Ausgabenerfassung', 'Einkommens- und Kategorienplanung', 'Aktueller Transaktionsverlauf'], proFeatures: ['Sprach-, Beleg- und Screenshot-Erfassung', 'Länderabhängige Steuerplanung und Währungen', 'Vollständige Analysen und Berichte'], restoreTitle: 'Käufe wiederherstellen', restoreSuccess: 'Vigil Pro wurde wiederhergestellt.', restoreNone: 'Für diese Apple-ID wurde kein aktiver Vigil-Pro-Kauf gefunden.', restoreError: 'Käufe konnten nicht wiederhergestellt werden. Bitte versuchen Sie es erneut.', adminMode: 'Der Admin-Testmodus ist aktiv. Pro-Erfassung und Analyse sind ohne Kauf verfügbar.', taxEstimate: (percent) => `Eine Planungsschätzung von ${percent}% ist unter Steuern reserviert. Passen Sie die Kategorie an Ihre Situation an.`, noTaxBucket: 'Für dieses Land wird keine Einkommensteuer-Kategorie angezeigt.', morningReminderCopy: '08:00 · Erfassen Sie Ausgaben, bevor der Tag laut wird.', eveningReminderCopy: '20:30 · Schließen Sie den Tag freundlich ab.', signInMethods: ' · Google oder E-Mail', adminLabel: 'Admin', signingOut: 'Abmeldung…' },
  es: { ...en, yourPlan: 'Tu plan de Vigil', proUnlocked: 'Todas las funciones están desbloqueadas.', freeClarity: 'Claridad diaria, siempre gratis.', freeFeatures: ['Registro manual de gastos', 'Planificación de ingresos y categorías', 'Historial reciente de transacciones'], proFeatures: ['Captura de voz, recibos y capturas', 'Planificación fiscal y divisas por país', 'Informes y análisis completos'], restoreTitle: 'Restaurar compras', restoreSuccess: 'Vigil Pro se ha restaurado.', restoreNone: 'No se encontró una compra activa de Vigil Pro para este Apple ID.', restoreError: 'No se pudieron restaurar las compras. Inténtalo de nuevo.', adminMode: 'El modo de prueba de administrador está activo. La captura y el análisis Pro están disponibles sin compra.', taxEstimate: (percent) => `Se reserva una estimación del ${percent}% en Impuestos. Ajusta esta categoría a tu situación.`, noTaxBucket: 'No se muestra una categoría de impuesto sobre la renta para este país.', morningReminderCopy: '08:00 · Registra antes de que el día se complique.', eveningReminderCopy: '20:30 · Cierra el día con calma.', signInMethods: ' · Google o correo', adminLabel: 'Admin', signingOut: 'Cerrando sesión…' },
  ru: { ...en, yourPlan: 'Ваш план Vigil', proUnlocked: 'Все функции открыты.', freeClarity: 'Понятность каждый день — бесплатно.', freeFeatures: ['Ручная запись расходов', 'Планирование доходов и категорий', 'Недавняя история операций'], proFeatures: ['Голосовой ввод, чеки и снимки', 'Налоговое планирование и валюты по стране', 'Полные отчёты и анализ'], restoreTitle: 'Восстановить покупки', restoreSuccess: 'Vigil Pro восстановлен.', restoreNone: 'Для этого Apple ID не найдено активной покупки Vigil Pro.', restoreError: 'Не удалось восстановить покупки. Повторите попытку.', adminMode: 'Включён режим тестирования администратора. Функции Pro доступны без покупки.', taxEstimate: (percent) => `В разделе налогов зарезервирована оценка ${percent}%. Настройте категорию под свою ситуацию.`, noTaxBucket: 'Для этой страны категория подоходного налога не отображается.', morningReminderCopy: '08:00 · Запишите расход до начала суеты.', eveningReminderCopy: '20:30 · Завершите день спокойно.', signInMethods: ' · Google или почта', adminLabel: 'Администратор', signingOut: 'Выход…' },
  ar: { ...en, yourPlan: 'خطة Vigil الخاصة بك', proUnlocked: 'جميع الميزات مفتوحة.', freeClarity: 'وضوح يومي، مجاناً دائماً.', freeFeatures: ['تسجيل الإنفاق يدوياً', 'تخطيط الدخل والفئات', 'سجل المعاملات الأخيرة'], proFeatures: ['التسجيل الصوتي والإيصالات ولقطات الشاشة', 'تخطيط الضرائب والعملات حسب البلد', 'تقارير التحليل والرؤى الكاملة'], restoreTitle: 'استعادة المشتريات', restoreSuccess: 'تمت استعادة Vigil Pro.', restoreNone: 'لم يتم العثور على شراء نشط لـ Vigil Pro لهذا Apple ID.', restoreError: 'تعذر استعادة المشتريات. حاول مجدداً.', adminMode: 'وضع اختبار المسؤول نشط. تتوفر ميزات Pro للتسجيل والتحليل دون شراء.', taxEstimate: (percent) => `تم تخصيص تقدير ${percent}% في الضرائب. عدّل هذه الفئة بما يناسب وضعك.`, noTaxBucket: 'لا تظهر فئة ضريبة الدخل الشخصي لهذا البلد.', morningReminderCopy: '٨:٠٠ صباحاً · سجّل قبل أن يبدأ ازدحام اليوم.', eveningReminderCopy: '٨:٣٠ مساءً · أغلق يومك بلطف.', signInMethods: ' · Google أو البريد الإلكتروني', adminLabel: 'المسؤول', signingOut: 'جارٍ تسجيل الخروج…' },
};

export function settingsCopy(language: Language): SettingsCopy {
  return standardizeVisibleBrandCopy(language === 'en' ? en : translations[language]);
}