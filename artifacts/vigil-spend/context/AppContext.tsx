import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import colors from '@/constants/colors';
import { extendedMessage, localeByLanguage } from '@/lib/localization';
import { cancelReminderNotifications, syncReminderNotifications } from '@/lib/notifications';
import { useIdentity } from '@/context/IdentityContext';
import { accountStorageKey } from '@/lib/accountScope';
import { resolveDeviceDefaults } from '@/lib/deviceDefaults';
import { standardizeVisibleBrand } from '@/lib/brand';
import { getLocales } from 'expo-localization';

import { countries as allCountries } from 'countries-list';

export type Language = 'en' | 'fr' | 'cs' | 'de' | 'es' | 'ru' | 'ar';
export type ThemeMode = 'light' | 'dark' | 'auto';
export type BucketId = string;
export type CurrencyCode = string;
export type CountryCode = string;
export const EXCHANGE_RATE_PROVIDER = 'open.er-api.com';
const MAX_RATE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
function hasUsableRate(rate: number | undefined, updatedAt: string | null, needsRate: boolean) {
  if (!needsRate) return true;
  if (!Number.isFinite(rate) || !rate || !updatedAt) return false;
  const timestamp = new Date(updatedAt).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const age = Date.now() - timestamp;
  return age >= -5 * 60 * 1000 && age <= MAX_RATE_AGE_MS;
}

const KNOWN_TAXES: Record<string, number> = {
  AE: 0,
  US: 20,
  GB: 20,
  DE: 25,
  CZ: 15,
  CA: 20,
  AU: 20,
  SA: 0,
  IN: 15,
  JP: 20,
  CH: 15,
  RU: 13,
};

export const countries: { code: CountryCode; name: string; currency: CurrencyCode; taxPercent: number }[] = Object.entries(allCountries).map(([code, data]) => ({
  code,
  name: data.name,
  currency: data.currency[0] || 'USD',
  taxPercent: KNOWN_TAXES[code] || 0,
})).sort((a, b) => a.name.localeCompare(b.name));

export type Transaction = {
  id: string;
  amount: number;
  currency: string;
  note: string;
  bucketId: BucketId;
  date: string;
  source: 'manual' | 'receipt' | 'bank' | 'voice';
  originalAmount?: number;
  originalCurrency?: string;
  rateAsOf?: string | null;
};

export type IncomeEntry = {
  id: string;
  amount: number;
  type: string;
  date: string;
};

export type Goal = {
  id: string;
  name: string;
  target: number;
  allocated: number;
  currency: CurrencyCode;
  targetDate: string | null;
  status: 'active' | 'completed';
  createdAt: string;
};

export type Bucket = {
  id: BucketId;
  labelKey: string;
  icon: string;
  percent: number;
  tone: BucketId;
};

export function createDefaultBuckets(taxPercent: number): Bucket[] {
  const nonTax = 100 - taxPercent;
  const weights = [
    { id: 'needs' as const, labelKey: 'needs', icon: 'home-heart', weight: 37 },
    { id: 'savings' as const, labelKey: 'savings', icon: 'piggy-bank-outline', weight: 20 },
    { id: 'investment' as const, labelKey: 'investment', icon: 'chart-line', weight: 20 },
    { id: 'development' as const, labelKey: 'development', icon: 'book-open-page-variant', weight: 8 },
    { id: 'charity' as const, labelKey: 'charity', icon: 'gift-outline', weight: 5 },
    { id: 'fun' as const, labelKey: 'fun', icon: 'party-popper', weight: 10 },
  ];
  const scaled = weights.map((item) => ({
    id: item.id,
    labelKey: item.labelKey,
    icon: item.icon,
    percent: Math.round((item.weight / 100) * nonTax),
    tone: item.id,
  }));
  const allocated = scaled.reduce((sum, item) => sum + item.percent, 0);
  scaled[0].percent += nonTax - allocated;
  return taxPercent > 0
    ? [{ id: 'tax', labelKey: 'tax', icon: 'file-document-outline', percent: taxPercent, tone: 'tax' }, ...scaled]
    : scaled;
}

export const bucketDefaults = createDefaultBuckets(0);

function rebalanceAroundBucket(buckets: Bucket[], bucketId: BucketId, requestedPercent: number) {
  const nextPercent = Math.max(0, Math.min(100, Math.round(requestedPercent)));
  const selected = buckets.find((bucket) => bucket.id === bucketId);
  if (!selected) return buckets;

  const others = buckets
    .map((bucket, index) => ({ bucket, index }))
    .filter(({ bucket }) => bucket.id !== bucketId)
    .sort((a, b) => b.bucket.percent - a.bucket.percent);
  const next = buckets.map((bucket) => ({ ...bucket }));
  const delta = nextPercent - selected.percent;
  next.find((bucket) => bucket.id === bucketId)!.percent = nextPercent;

  if (delta > 0) {
    let remaining = delta;
    for (const { bucket } of others) {
      const target = next.find((item) => item.id === bucket.id)!;
      const reduction = Math.min(target.percent, remaining);
      target.percent -= reduction;
      remaining -= reduction;
      if (!remaining) break;
    }
  } else if (delta < 0 && others.length) {
    next.find((bucket) => bucket.id === others[0].bucket.id)!.percent += Math.abs(delta);
  }

  return next;
}

const copy: Record<Language, Record<string, string>> = {
  en: {
    spending: 'Spending', plan: 'Plan', history: 'History', analysis: 'Analysis', settings: 'Settings',
    hello: 'Hi', where: 'Where does it all go', kept: 'of income kept', netSavings: 'Net savings',
    income: 'Income', expenses: 'Expenses', remaining: 'Remaining to spend', left: 'left', over: 'over',
    viewTransactions: 'View and edit transactions', clearHistory: 'Clear history & start over', logSpending: 'Log spending',
    logTransaction: 'Log a transaction', speakOrType: 'Speak it or type it — no bank connection needed.', amount: 'Amount',
    date: 'Date', bucket: 'Bucket', note: 'Note', saveTransaction: 'Save transaction', recent: 'Recent',
    addIncome: 'Add income', incomeType: 'Income type', salary: 'Salary', commission: 'Commission', client: 'Client payment',
    other: 'Other', saveIncome: 'Save income', morning: 'Morning reminder', evening: 'Evening reminder',
    reminderCopy: 'Small nudges make responsible habits stick.', appearance: 'Appearance', language: 'Language',
    profile: 'Profile', signIn: 'Sign in', signOut: 'Sign out', privacy: 'Privacy policy', terms: 'Terms of use',
    support: 'Support', report: 'Your monthly report', reportCopy: 'Vigil Spend is spotting the patterns so your money can get a better job.',
    unlock: 'Unlock deeper insights', locked: 'Premium reports are ready when you are.', manage: 'Manage subscription',
    buckets: 'Your buckets', bucketCopy: 'Give every amount a purpose before it gets a chance to disappear.', development: 'Self Development',
    adjust: 'Adjust', total: 'Total', saved: 'Saved', excellent: 'Excellent move', watch: 'Worth a watch',
    scanReceipt: 'Scan a receipt', bankMessage: 'Add from bank messages', voiceHint: 'Try: “30 on taxi and 50 on groceries”',
    manual: 'Manual', receipt: 'Receipt', bank: 'Bank screenshot', voice: 'Voice note', chooseSource: 'Choose a capture method',
     captureProcessingReceipt: 'Reading your receipt…', captureProcessingBank: 'Reading your bank message…', captureDone: 'Details found. Review them before saving.', noTransactions: 'No transactions yet',
    noTransactionsCopy: 'Your next logged spending will show up here.', themeLight: 'Light', themeDark: 'Dark', themeAuto: 'Auto',
    country: 'Country & currency', countryCopy: 'AED • United Arab Emirates', tax: 'Estimated tax set aside',
    positiveAction: 'Nice work — your future self just exhaled.', negativeAction: 'That bucket is running hot. A tiny reset beats a big regret.',
    transactionSavedWithNote: 'Saved {amount} for {note} in {bucket}. One less expense to keep in your head.',
    transactionSavedInBucket: 'Saved {amount} in {bucket}. Your plan is clearer now.',
    transactionsSaved: 'Saved {count} expenses totaling {amount}. Your plan is up to date.',
    purchaseUnavailable: 'Pricing will appear when App Store products are ready.',
    purchaseReady: 'Choose a plan to start your 7-day free trial.', monthly: 'Monthly', yearly: 'Yearly',
    continueWithGoogle: 'Continue with Google', signUpWithGoogle: 'Sign up with Google', continueWithApple: 'Continue with Apple', signUpWithApple: 'Sign up with Apple', continueWithFacebook: 'Continue with Facebook',
    welcomeBack: 'Welcome back', signUp: 'Create account', email: 'Email', password: 'Password', continueLabel: 'Continue',
  },
  fr: {
    spending: 'Dépenses', plan: 'Plan', history: 'Historique', analysis: 'Analyse', settings: 'Réglages', hello: 'Bonjour',
    where: 'Où va tout cet argent', kept: 'du revenu conservé', netSavings: 'Épargne nette', income: 'Revenus', expenses: 'Dépenses',
    remaining: 'Reste à dépenser', left: 'restant', over: 'dépassé', viewTransactions: 'Voir et modifier les transactions',
    clearHistory: 'Effacer l’historique', logSpending: 'Noter une dépense', logTransaction: 'Noter une transaction',
    speakOrType: 'Parlez ou écrivez — aucune banque nécessaire.', amount: 'Montant', date: 'Date', bucket: 'Catégorie', note: 'Note',
    saveTransaction: 'Enregistrer', recent: 'Récentes', addIncome: 'Ajouter un revenu', incomeType: 'Type de revenu', salary: 'Salaire',
    commission: 'Commission', client: 'Paiement client', other: 'Autre', saveIncome: 'Enregistrer le revenu', morning: 'Rappel du matin',
    evening: 'Rappel du soir', reminderCopy: 'Les petits rappels créent de bonnes habitudes.', appearance: 'Apparence',
    language: 'Langue', profile: 'Profil', signIn: 'Se connecter', signOut: 'Se déconnecter', privacy: 'Confidentialité',
    terms: 'Conditions', support: 'Assistance', report: 'Votre rapport mensuel', reportCopy: 'Vigil Spend repère vos habitudes pour aider votre argent.',
    unlock: 'Débloquer les analyses', locked: 'Les rapports premium vous attendent.', manage: 'Gérer l’abonnement', buckets: 'Vos catégories', development: 'Développement personnel',
    bucketCopy: 'Donnez un rôle à chaque montant avant qu’il ne disparaisse.', adjust: 'Modifier', total: 'Total', saved: 'Enregistré',
    excellent: 'Très bon choix', watch: 'À surveiller', scanReceipt: 'Scanner un reçu', bankMessage: 'Ajouter un message bancaire',
    voiceHint: 'Essayez : « 30 taxi et 50 courses »', manual: 'Manuel', receipt: 'Reçu', bank: 'Capture bancaire', voice: 'Note vocale',
     chooseSource: 'Choisir une méthode', captureProcessingReceipt: 'Lecture de votre reçu…', captureProcessingBank: 'Lecture de votre message bancaire…', captureDone: 'Détails trouvés. Vérifiez-les avant d’enregistrer.', noTransactions: 'Aucune transaction',
    noTransactionsCopy: 'Votre prochaine dépense apparaîtra ici.', themeLight: 'Clair', themeDark: 'Sombre', themeAuto: 'Auto',
    country: 'Pays et devise', countryCopy: 'AED • Émirats arabes unis', tax: 'Impôt estimé', positiveAction: 'Bien joué — votre futur vous remercie.',
    negativeAction: 'Cette catégorie chauffe. Une petite remise à zéro vaut mieux qu’un regret.', transactionSavedWithNote: '{amount} pour {note} est maintenant dans {bucket}. Une dépense de moins à garder en tête.', transactionSavedInBucket: '{amount} est maintenant dans {bucket}. Votre plan est plus clair.', transactionsSaved: '{count} dépenses pour un total de {amount}. Votre plan est à jour.', purchaseUnavailable: 'Les tarifs apparaîtront après la connexion de vos produits.',
    purchaseReady: 'Choisissez une formule pour commencer l’essai de 7 jours.', monthly: 'Mensuel', yearly: 'Annuel',
    continueWithGoogle: 'Continuer avec Google', signUpWithGoogle: 'S’inscrire avec Google', continueWithApple: 'Continuer avec Apple', signUpWithApple: 'S’inscrire avec Apple', continueWithFacebook: 'Continuer avec Facebook',
    welcomeBack: 'Bon retour', signUp: 'Créer un compte', email: 'E-mail', password: 'Mot de passe', continueLabel: 'Continuer',
  },
  cs: {
    spending: 'Výdaje', plan: 'Plán', history: 'Historie', analysis: 'Analýza', settings: 'Nastavení', hello: 'Ahoj',
    where: 'Kam to všechno mizí', kept: 'příjmu ušetřeno', netSavings: 'Čisté úspory', income: 'Příjmy', expenses: 'Výdaje',
    remaining: 'Zbývá utratit', left: 'zbývá', over: 'překročeno', viewTransactions: 'Zobrazit a upravit transakce',
    clearHistory: 'Vymazat historii', logSpending: 'Zapsat výdaj', logTransaction: 'Zapsat transakci', speakOrType: 'Mluvte nebo pište — banka není potřeba.',
    amount: 'Částka', date: 'Datum', bucket: 'Obálka', note: 'Poznámka', saveTransaction: 'Uložit transakci', recent: 'Nedávné',
    addIncome: 'Přidat příjem', incomeType: 'Typ příjmu', salary: 'Mzda', commission: 'Provize', client: 'Platba klienta', other: 'Jiné',
    saveIncome: 'Uložit příjem', morning: 'Ranní připomínka', evening: 'Večerní připomínka', reminderCopy: 'Malé připomínky tvoří dobré návyky.',
    appearance: 'Vzhled', language: 'Jazyk', profile: 'Profil', signIn: 'Přihlásit se', signOut: 'Odhlásit se', privacy: 'Soukromí',
    terms: 'Podmínky', support: 'Podpora', report: 'Měsíční přehled', reportCopy: 'Vigil hledá vzorce, aby vaše peníze pracovaly lépe.',
    unlock: 'Odemknout hlubší přehledy', locked: 'Prémiové přehledy jsou připravené.', manage: 'Spravovat předplatné', buckets: 'Vaše obálky', development: 'Osobní rozvoj',
    bucketCopy: 'Dejte každé koruně úkol dřív, než zmizí.', adjust: 'Upravit', total: 'Celkem', saved: 'Uloženo', excellent: 'Skvělý krok', watch: 'Stojí za pozornost',
    scanReceipt: 'Naskenovat účtenku', bankMessage: 'Přidat z bankovní zprávy', voiceHint: 'Zkuste: „30 taxi a 50 nákup“', manual: 'Ručně',
     receipt: 'Účtenka', bank: 'Bankovní snímek', voice: 'Hlasová poznámka', chooseSource: 'Vyberte způsob', captureProcessingReceipt: 'Čtu účtenku…', captureProcessingBank: 'Čtu bankovní zprávu…', captureDone: 'Údaje nalezeny. Před uložením je zkontrolujte.',
    noTransactions: 'Zatím žádné transakce', noTransactionsCopy: 'Další výdaj se zobrazí zde.', themeLight: 'Světlý', themeDark: 'Tmavý', themeAuto: 'Auto',
    country: 'Země a měna', countryCopy: 'AED • Spojené arabské emiráty', tax: 'Odhadovaná daň', positiveAction: 'Skvělá práce — vaše budoucí já děkuje.',
    negativeAction: 'Tahle obálka se zahřívá. Malý reset je lepší než velká lítost.', transactionSavedWithNote: '{amount} za {note} je teď v obálce {bucket}. O jeden výdaj méně, který musíte držet v hlavě.', transactionSavedInBucket: '{amount} je teď v obálce {bucket}. Váš plán je přehlednější.', transactionsSaved: '{count} výdaje v celkové výši {amount}. Váš plán je aktuální.', purchaseUnavailable: 'Ceny se zobrazí po připojení produktů.',
    purchaseReady: 'Vyberte plán a začněte 7denní zkušební období.', monthly: 'Měsíčně', yearly: 'Ročně',
    continueWithGoogle: 'Pokračovat přes Google', signUpWithGoogle: 'Registrovat přes Google', continueWithApple: 'Pokračovat přes Apple', signUpWithApple: 'Registrovat přes Apple', continueWithFacebook: 'Pokračovat přes Facebook',
    welcomeBack: 'Vítejte zpět', signUp: 'Vytvořit účet', email: 'E-mail', password: 'Heslo', continueLabel: 'Pokračovat',
  },
  de: {
    spending: 'Ausgaben', plan: 'Plan', history: 'Verlauf', analysis: 'Analyse', settings: 'Einstellungen', hello: 'Hallo',
    where: 'Wo geht das alles hin', kept: 'des Einkommens behalten', netSavings: 'Nettoersparnis', income: 'Einnahmen', expenses: 'Ausgaben',
    remaining: 'Noch auszugeben', left: 'übrig', over: 'zu viel', viewTransactions: 'Transaktionen ansehen und bearbeiten', clearHistory: 'Verlauf löschen',
    logSpending: 'Ausgabe erfassen', logTransaction: 'Transaktion erfassen', speakOrType: 'Sprechen oder tippen — keine Bankverbindung nötig.', amount: 'Betrag',
    date: 'Datum', bucket: 'Topf', note: 'Notiz', saveTransaction: 'Transaktion speichern', recent: 'Letzte', addIncome: 'Einnahme hinzufügen',
    incomeType: 'Einnahmeart', salary: 'Gehalt', commission: 'Provision', client: 'Kundenzahlung', other: 'Sonstige', saveIncome: 'Einnahme speichern',
    morning: 'Morgen-Erinnerung', evening: 'Abend-Erinnerung', reminderCopy: 'Kleine Impulse schaffen gute Gewohnheiten.', appearance: 'Darstellung',
    language: 'Sprache', profile: 'Profil', signIn: 'Anmelden', signOut: 'Abmelden', privacy: 'Datenschutz', terms: 'Nutzungsbedingungen', support: 'Support',
    report: 'Dein Monatsbericht', reportCopy: 'Vigil Spend erkennt Muster, damit dein Geld besser arbeitet.', unlock: 'Tiefere Einblicke freischalten',
    locked: 'Premium-Berichte warten auf dich.', manage: 'Abo verwalten', buckets: 'Deine Töpfe', development: 'Persönliche Entwicklung', bucketCopy: 'Gib jedem Euro eine Aufgabe, bevor er verschwindet.',
    adjust: 'Anpassen', total: 'Summe', saved: 'Gespeichert', excellent: 'Starker Schritt', watch: 'Im Blick behalten', scanReceipt: 'Beleg scannen',
    bankMessage: 'Aus Banknachrichten hinzufügen', voiceHint: 'Versuch: „30 Taxi und 50 Lebensmittel“', manual: 'Manuell', receipt: 'Beleg', bank: 'Bank-Screenshot',
     voice: 'Sprachnotiz', chooseSource: 'Aufnahme wählen', captureProcessingReceipt: 'Beleg wird gelesen…', captureProcessingBank: 'Banknachricht wird gelesen…', captureDone: 'Details gefunden. Bitte vor dem Speichern prüfen.', noTransactions: 'Noch keine Transaktionen',
    noTransactionsCopy: 'Die nächste Ausgabe erscheint hier.', themeLight: 'Hell', themeDark: 'Dunkel', themeAuto: 'Auto', country: 'Land und Währung',
    countryCopy: 'AED • Vereinigte Arabische Emirate', tax: 'Geschätzte Steuer', positiveAction: 'Gut gemacht — dein zukünftiges Ich freut sich.',
    negativeAction: 'Dieser Topf wird heiß. Ein kleiner Reset ist besser als ein großer Frust.', transactionSavedWithNote: '{amount} für {note} ist jetzt in {bucket}. Eine Ausgabe weniger, über die du nachdenken musst.', transactionSavedInBucket: '{amount} ist jetzt in {bucket}. Dein Plan ist klarer.', transactionsSaved: '{count} Ausgaben über {amount}. Dein Plan ist auf dem neuesten Stand.', purchaseUnavailable: 'Preise erscheinen nach dem Verbinden deiner Produkte.',
    purchaseReady: 'Wähle einen Plan für die 7-tägige Probezeit.', monthly: 'Monatlich', yearly: 'Jährlich',
    continueWithGoogle: 'Mit Google fortfahren', signUpWithGoogle: 'Mit Google registrieren', continueWithApple: 'Mit Apple fortfahren', signUpWithApple: 'Mit Apple registrieren', continueWithFacebook: 'Mit Facebook fortfahren',
    welcomeBack: 'Willkommen zurück', signUp: 'Konto erstellen', email: 'E-Mail', password: 'Passwort', continueLabel: 'Weiter',
  },
  es: {
    spending: 'Gastos', plan: 'Plan', history: 'Historial', analysis: 'Análisis', settings: 'Ajustes', hello: 'Hola',
    where: '¿A dónde se va todo', kept: 'de ingresos guardados', netSavings: 'Ahorro neto', income: 'Ingresos', expenses: 'Gastos',
    remaining: 'Restante para gastar', left: 'restante', over: 'excedido', viewTransactions: 'Ver y editar transacciones', clearHistory: 'Borrar historial',
    logSpending: 'Registrar gasto', logTransaction: 'Registrar una transacción', speakOrType: 'Habla o escribe — no necesitas conectar tu banco.', amount: 'Importe',
    date: 'Fecha', bucket: 'Categoría', note: 'Nota', saveTransaction: 'Guardar transacción', recent: 'Recientes', addIncome: 'Añadir ingresos',
    incomeType: 'Tipo de ingreso', salary: 'Salario', commission: 'Comisión', client: 'Pago de cliente', other: 'Otro', saveIncome: 'Guardar ingreso',
    morning: 'Recordatorio matutino', evening: 'Recordatorio nocturno', reminderCopy: 'Pequeños recordatorios crean buenos hábitos.', appearance: 'Apariencia',
    language: 'Idioma', profile: 'Perfil', signIn: 'Iniciar sesión', signOut: 'Cerrar sesión', privacy: 'Privacidad', terms: 'Términos', support: 'Soporte',
    report: 'Tu informe mensual', reportCopy: 'Vigil Spend encuentra patrones para que tu dinero trabaje mejor.', unlock: 'Desbloquear más información',
    locked: 'Los informes premium están listos.', manage: 'Gestionar suscripción', buckets: 'Tus categorías', development: 'Desarrollo personal', bucketCopy: 'Dale un trabajo a cada euro antes de que desaparezca.',
    adjust: 'Ajustar', total: 'Total', saved: 'Guardado', excellent: 'Gran decisión', watch: 'Para vigilar', scanReceipt: 'Escanear recibo',
    bankMessage: 'Añadir desde mensajes bancarios', voiceHint: 'Prueba: «30 taxi y 50 supermercado»', manual: 'Manual', receipt: 'Recibo', bank: 'Captura bancaria',
     voice: 'Nota de voz', chooseSource: 'Elige un método', captureProcessingReceipt: 'Leyendo tu recibo…', captureProcessingBank: 'Leyendo tu mensaje bancario…', captureDone: 'Detalles encontrados. Revísalos antes de guardar.', noTransactions: 'Aún no hay transacciones',
    noTransactionsCopy: 'Tu próximo gasto aparecerá aquí.', themeLight: 'Claro', themeDark: 'Oscuro', themeAuto: 'Auto', country: 'País y moneda',
    countryCopy: 'AED • Emiratos Árabes Unidos', tax: 'Impuesto estimado', positiveAction: 'Buen trabajo — tu futuro yo respira tranquilo.',
    negativeAction: 'Esta categoría se está calentando. Un pequeño reinicio evita un gran arrepentimiento.', transactionSavedWithNote: '{amount} para {note} está en {bucket}. Un gasto menos del que preocuparte.', transactionSavedInBucket: '{amount} está en {bucket}. Tu plan está más claro.', transactionsSaved: '{count} gastos por un total de {amount}. Tu plan está al día.', purchaseUnavailable: 'Los precios aparecerán al conectar tus productos.',
    purchaseReady: 'Elige un plan para comenzar la prueba de 7 días.', monthly: 'Mensual', yearly: 'Anual',
    continueWithGoogle: 'Continuar con Google', signUpWithGoogle: 'Registrarse con Google', continueWithApple: 'Continuar con Apple', signUpWithApple: 'Registrarse con Apple', continueWithFacebook: 'Continuar con Facebook',
    welcomeBack: 'Qué bueno verte', signUp: 'Crear cuenta', email: 'Correo', password: 'Contraseña', continueLabel: 'Continuar',
  },
  ru: {
    spending: 'Расходы', plan: 'План', history: 'История', analysis: 'Анализ', settings: 'Настройки', hello: 'Привет',
    where: 'Куда всё уходит', kept: 'дохода сохранено', netSavings: 'Чистые сбережения', income: 'Доходы', expenses: 'Расходы',
    remaining: 'Осталось потратить', left: 'осталось', over: 'сверх лимита', viewTransactions: 'Посмотреть и изменить операции', clearHistory: 'Очистить историю',
    logSpending: 'Записать расход', logTransaction: 'Записать операцию', speakOrType: 'Говорите или пишите — подключение банка не нужно.', amount: 'Сумма',
    date: 'Дата', bucket: 'Категория', note: 'Заметка', saveTransaction: 'Сохранить операцию', recent: 'Недавние', addIncome: 'Добавить доход',
    incomeType: 'Тип дохода', salary: 'Зарплата', commission: 'Комиссия', client: 'Платёж клиента', other: 'Другое', saveIncome: 'Сохранить доход',
    morning: 'Утреннее напоминание', evening: 'Вечернее напоминание', reminderCopy: 'Маленькие напоминания создают привычки.', appearance: 'Вид',
    language: 'Язык', profile: 'Профиль', signIn: 'Войти', signOut: 'Выйти', privacy: 'Конфиденциальность', terms: 'Условия', support: 'Поддержка',
    report: 'Ваш отчёт за месяц', reportCopy: 'Vigil Spend ищет закономерности, чтобы ваши деньги работали лучше.', unlock: 'Открыть глубокий анализ',
    locked: 'Премиум-отчёты уже готовы.', manage: 'Управлять подпиской', buckets: 'Ваши категории', development: 'Личное развитие', bucketCopy: 'Дайте каждому рублю задачу до того, как он исчезнет.',
    adjust: 'Изменить', total: 'Всего', saved: 'Сохранено', excellent: 'Отличный шаг', watch: 'Стоит следить', scanReceipt: 'Сканировать чек',
    bankMessage: 'Добавить из банковских сообщений', voiceHint: 'Попробуйте: «30 такси и 50 продукты»', manual: 'Вручную', receipt: 'Чек', bank: 'Снимок банка',
     voice: 'Голосовая заметка', chooseSource: 'Выберите способ', captureProcessingReceipt: 'Читаем чек…', captureProcessingBank: 'Читаем сообщение банка…', captureDone: 'Данные найдены. Проверьте их перед сохранением.', noTransactions: 'Операций пока нет',
    noTransactionsCopy: 'Следующий расход появится здесь.', themeLight: 'Светлая', themeDark: 'Тёмная', themeAuto: 'Авто', country: 'Страна и валюта',
    countryCopy: 'AED • ОАЭ', tax: 'Расчётный налог', positiveAction: 'Отлично — ваше будущее «я» выдохнуло.', negativeAction: 'Категория перегревается. Маленький сброс лучше большого сожаления.', transactionSavedWithNote: '{amount} на «{note}» добавлено в категорию «{bucket}». Одной заботой меньше.', transactionSavedInBucket: '{amount} добавлено в категорию «{bucket}». Ваш план стал понятнее.', transactionsSaved: '{count} расходов на общую сумму {amount}. План обновлён.',
    purchaseUnavailable: 'Цены появятся после подключения продуктов.', purchaseReady: 'Выберите план и начните 7-дневный пробный период.', monthly: 'Ежемесячно', yearly: 'Ежегодно',
    continueWithGoogle: 'Продолжить с Google', signUpWithGoogle: 'Регистрация через Google', continueWithApple: 'Продолжить с Apple', signUpWithApple: 'Регистрация через Apple', continueWithFacebook: 'Продолжить с Facebook',
    welcomeBack: 'С возвращением', signUp: 'Создать аккаунт', email: 'Эл. почта', password: 'Пароль', continueLabel: 'Продолжить',
  },
  ar: {
    spending: 'المصروفات', plan: 'الخطة', history: 'السجل', analysis: 'التحليل', settings: 'الإعدادات', hello: 'مرحباً',
    where: 'أين يذهب كل شيء', kept: 'من الدخل محفوظ', netSavings: 'صافي المدخرات', income: 'الدخل', expenses: 'المصروفات',
    remaining: 'المتبقي للإنفاق', left: 'متبقي', over: 'متجاوز', viewTransactions: 'عرض وتعديل المعاملات', clearHistory: 'مسح السجل والبدء من جديد',
    logSpending: 'تسجيل مصروف', logTransaction: 'تسجيل معاملة', speakOrType: 'تحدث أو اكتب — لا حاجة لربط بنك.', amount: 'المبلغ',
    date: 'التاريخ', bucket: 'الفئة', note: 'ملاحظة', saveTransaction: 'حفظ المعاملة', recent: 'الأخيرة', addIncome: 'إضافة دخل',
    incomeType: 'نوع الدخل', salary: 'راتب', commission: 'عمولة', client: 'دفعة عميل', other: 'أخرى', saveIncome: 'حفظ الدخل',
    morning: 'تذكير الصباح', evening: 'تذكير المساء', reminderCopy: 'التذكيرات الصغيرة تبني عادات جيدة.', appearance: 'المظهر',
    language: 'اللغة', profile: 'الملف الشخصي', signIn: 'تسجيل الدخول', signOut: 'تسجيل الخروج', privacy: 'الخصوصية', terms: 'الشروط', support: 'الدعم',
    report: 'تقريرك الشهري', reportCopy: 'يرصد Vigil Spend الأنماط لتعمل أموالك بشكل أفضل.', unlock: 'فتح التحليلات المتقدمة', locked: 'التقارير المميزة جاهزة لك.',
    manage: 'إدارة الاشتراك', buckets: 'فئاتك', development: 'التطوير الذاتي', bucketCopy: 'امنح كل مبلغ هدفًا قبل أن يختفي.', adjust: 'تعديل', total: 'الإجمالي', saved: 'تم الحفظ',
    excellent: 'خطوة رائعة', watch: 'يستحق المراقبة', scanReceipt: 'مسح إيصال', bankMessage: 'إضافة من رسائل البنك', voiceHint: 'جرّب: «30 تاكسي و50 بقالة»',
     manual: 'يدوي', receipt: 'إيصال', bank: 'لقطة بنكية', voice: 'ملاحظة صوتية', chooseSource: 'اختر طريقة التسجيل', captureProcessingReceipt: 'جارٍ قراءة الإيصال…', captureProcessingBank: 'جارٍ قراءة الرسالة البنكية…', captureDone: 'تم العثور على التفاصيل. راجعها قبل الحفظ.',
    noTransactions: 'لا توجد معاملات بعد', noTransactionsCopy: 'سيظهر مصروفك التالي هنا.', themeLight: 'فاتح', themeDark: 'داكن', themeAuto: 'تلقائي',
    country: 'الدولة والعملة', countryCopy: 'AED • الإمارات العربية المتحدة', tax: 'الضريبة المقدرة', positiveAction: 'أحسنت — نفسك المستقبلية تشكرك.',
    negativeAction: 'هذه الفئة تقترب من النفاد. إعادة ضبط صغيرة أفضل من ندم كبير.', transactionSavedWithNote: 'تم حفظ {amount} لـ {note} ضمن {bucket}. مصروف واحد أقل لتفكر فيه.', transactionSavedInBucket: 'تم حفظ {amount} ضمن {bucket}. أصبحت خطتك أوضح.', transactionsSaved: 'تم حفظ {count} مصروفات بإجمالي {amount}. خطتك محدثة.', purchaseUnavailable: 'ستظهر الأسعار عند ربط منتجاتك.',
    purchaseReady: 'اختر خطة لبدء التجربة المجانية لمدة 7 أيام.', monthly: 'شهري', yearly: 'سنوي',
    continueWithGoogle: 'المتابعة مع Google', signUpWithGoogle: 'التسجيل باستخدام Google', continueWithApple: 'المتابعة مع Apple', signUpWithApple: 'التسجيل باستخدام Apple', continueWithFacebook: 'المتابعة مع Facebook',
    welcomeBack: 'مرحباً بعودتك', signUp: 'إنشاء حساب', email: 'البريد الإلكتروني', password: 'كلمة المرور', continueLabel: 'متابعة',
  },
};

const bucketLabelKeys = new Set(['tax', 'needs', 'savings', 'investment', 'development', 'charity', 'fun']);
const subscriptionProviderLabels: Record<Language, string> = {
  en: 'our secure subscription service',
  fr: 'notre service d’abonnement sécurisé',
  cs: 'naše zabezpečená služba předplatného',
  de: 'unser sicherer Abonnementdienst',
  es: 'nuestro servicio seguro de suscripciones',
  ru: 'наш защищённый сервис подписок',
  ar: 'خدمة الاشتراكات الآمنة لدينا',
};

type Palette = typeof colors.light;

type AppState = {
  income: number;
  incomeEntries: IncomeEntry[];
  transactions: Transaction[];
  goals: Goal[];
  buckets: Bucket[];
  language: Language;
  themeMode: ThemeMode;
  morningReminder: boolean;
  eveningReminder: boolean;
  countryCode: CountryCode;
  currency: CurrencyCode;
  rates: Partial<Record<CurrencyCode, number>>;
  ratesUpdatedAt: string | null;
  ratesError: string | null;
  profileImageUri: string | null;
  profileFirstName: string;
  onboardingAnswers: string[];
  onboardingComplete: boolean;
  hydrated: boolean;
};

type AppContextValue = AppState & {
  palette: Palette & { radius: number };
  isDark: boolean;
  offlineSession: boolean;
  t: (key: string) => string;
  addTransaction: (transaction: Omit<Transaction, 'id'>) => void;
  updateTransaction: (id: string, transaction: Omit<Transaction, 'id'>) => void;
  removeTransaction: (id: string) => void;
  addIncome: (amount: number, type?: string) => void;
  removeIncome: (id: string) => void;
  addGoal: (goal: Omit<Goal, 'id' | 'createdAt' | 'status'>, allowMultiple?: boolean) => void;
  updateGoal: (id: string, goal: Partial<Pick<Goal, 'name' | 'target' | 'targetDate' | 'allocated'>>) => void;
  completeGoal: (id: string) => void;
  removeGoal: (id: string) => void;
  setBucketPercent: (id: BucketId, percent: number) => void;
  addBucket: (label: string, percent: number) => void;
  updateBucket: (id: BucketId, label: string) => void;
  removeBucket: (id: BucketId) => void;
  setLanguage: (language: Language) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setMorningReminder: (value: boolean) => void;
  setEveningReminder: (value: boolean) => void;
  setCountry: (country: CountryCode) => void;
  setCurrency: (currency: CurrencyCode) => void;
  setProfileImageUri: (uri: string | null) => void;
  setProfileFirstName: (name: string) => void;
  completeOnboarding: (answers?: string[]) => void;
  refreshRates: () => Promise<Partial<Record<CurrencyCode, number>>>;
  hasCurrentRate: boolean;
  formatTransactionMoney: (transaction: Pick<Transaction, 'amount' | 'originalAmount' | 'originalCurrency'>) => string;
  formatMoney: (amountInAed: number) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatPercent: (value: number) => string;
  formatDate: (value: Date | string, options?: Intl.DateTimeFormatOptions) => string;
  toBaseAmount: (displayAmount: number) => number;
  resetOnboarding: () => void;
  clearHistory: () => void;
  startOver: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function createInitialState(): AppState {
  const deviceDefaults = resolveDeviceDefaults(getLocales(), countries);
  return {
    income: 0,
    incomeEntries: [],
    transactions: [],
    goals: [],
    buckets: bucketDefaults,
    language: deviceDefaults.language,
    themeMode: 'auto',
    morningReminder: true,
    eveningReminder: true,
    countryCode: deviceDefaults.countryCode,
    currency: deviceDefaults.currency,
    rates: { AED: 1 },
    ratesUpdatedAt: null,
    ratesError: null,
    profileImageUri: null,
    profileFirstName: '',
    onboardingAnswers: [],
    onboardingComplete: false,
    hydrated: true,
  };
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function VigilProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const { isLoaded: authLoaded, userId } = useIdentity();
  const [state, setState] = useState<AppState>(() => ({ ...createInitialState(), hydrated: false }));
  const [loadedScope, setLoadedScope] = useState<string | null | undefined>(undefined);
  const scopedUserId = userId;
  const offlineSession = false;

  useEffect(() => {
    if (!authLoaded) return;
    let cancelled = false;
    const initialState = createInitialState();
    setLoadedScope(undefined);
    setState({ ...initialState, hydrated: false });
    if (!scopedUserId) {
      setState({ ...initialState, hydrated: true });
      setLoadedScope(null);
      return () => { cancelled = true; };
    }
    const load = async () => {
      const key = accountStorageKey(scopedUserId);
      // The legacy v3 key has no trustworthy owner. Never claim it for the
      // first account that signs in; leave it quarantined and start this
      // authenticated account with its own clean v4 state.
      const raw = await AsyncStorage.getItem(key);
      if (cancelled) return;
      if (!raw) {
        setState({ ...initialState, hydrated: true });
        setLoadedScope(scopedUserId);
        return;
      }
      try {
        const saved = JSON.parse(raw) as Partial<AppState>;
        setState({
          ...initialState,
          ...saved,
          incomeEntries: saved.incomeEntries ?? [],
          goals: saved.goals ?? [],
          buckets: saved.buckets?.some((bucket) => bucket.id === 'allowance' as BucketId)
            ? createDefaultBuckets(countries.find((country) => country.code === (saved.countryCode ?? 'AE'))?.taxPercent ?? 0)
            : saved.buckets?.length ? saved.buckets : bucketDefaults,
          transactions: (saved.transactions ?? []).map((transaction) => ({
            ...transaction,
            bucketId: transaction.bucketId === ('allowance' as BucketId) ? 'fun' : transaction.bucketId,
          })),
          hydrated: true,
        });
        setLoadedScope(scopedUserId);
      } catch {
        setState({ ...initialState, hydrated: true });
        setLoadedScope(scopedUserId);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [authLoaded, scopedUserId]);

  useEffect(() => {
    if (!state.hydrated || loadedScope !== scopedUserId || !scopedUserId) return;
    const { hydrated: _hydrated, ...persisted } = state;
    AsyncStorage.setItem(accountStorageKey(scopedUserId), JSON.stringify(persisted)).catch(() => undefined);
  }, [loadedScope, scopedUserId, state]);

  const refreshRates = async (): Promise<Partial<Record<CurrencyCode, number>>> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/AED', { signal: controller.signal });
      if (!response.ok) throw new Error('Rates unavailable');
      const data = await response.json() as { result?: string; rates?: Partial<Record<CurrencyCode, number>>; time_last_update_utc?: string };
      if (data.result && data.result !== 'success') throw new Error('Rates provider returned an error');
      const validRates = Object.fromEntries(Object.entries(data.rates ?? {}).filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value > 0)) as Partial<Record<CurrencyCode, number>>;
      if (validRates.AED !== 1 && !validRates.AED) throw new Error('Invalid rates response');
      const updatedAt = data.time_last_update_utc ? new Date(data.time_last_update_utc) : new Date();
      if (Number.isNaN(updatedAt.getTime())) throw new Error('Invalid rates timestamp');
      const providerAge = Date.now() - updatedAt.getTime();
      if (providerAge < -5 * 60 * 1000 || providerAge > MAX_RATE_AGE_MS) throw new Error('Rates are too old to verify');
      const nextRates = { ...validRates, AED: 1 };
      setState((current) => ({
        ...current,
        rates: { ...current.rates, ...nextRates },
        ratesUpdatedAt: updatedAt.toISOString(),
        ratesError: null,
      }));
      return nextRates;
    } catch (error) {
      // Keep the last successfully cached rates so the app remains usable offline.
      setState((current) => ({ ...current, ratesError: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'unavailable' }));
      return {};
    } finally {
      clearTimeout(timeout);
    }
  };

  useEffect(() => {
    if (!state.hydrated) return;
    const updatedAt = state.ratesUpdatedAt ? new Date(state.ratesUpdatedAt).getTime() : 0;
    const stale = !updatedAt || Date.now() - updatedAt > 12 * 60 * 60 * 1000;
    if (stale) void refreshRates();
  }, [state.hydrated, state.ratesUpdatedAt]);

  useEffect(() => {
    if (Platform.OS === 'web' || !state.hydrated || loadedScope !== scopedUserId) return;
    if (!scopedUserId) {
      void cancelReminderNotifications();
      return;
    }
    const latestTransactionDate = state.transactions.reduce<string | null>((latest, transaction) => {
      if (!latest || transaction.date > latest) return transaction.date;
      return latest;
    }, null);
    void syncReminderNotifications({
      morning: state.morningReminder,
      evening: state.eveningReminder,
      latestTransactionDate,
      language: state.language,
    });
  }, [loadedScope, scopedUserId, state.eveningReminder, state.hydrated, state.language, state.morningReminder, state.transactions]);

  const resolvedScheme = state.themeMode === 'auto' ? systemScheme : state.themeMode;
  const palette = (resolvedScheme === 'dark' ? colors.dark : colors.light) as Palette;
  const isDark = resolvedScheme === 'dark';
  // Effects run after render. Never expose a prior account's in-memory state
  // during that transition, even for one frame, before its scoped storage load
  // has completed.
  const scopedState = loadedScope === scopedUserId
    ? state
    : { ...createInitialState(), hydrated: false };

  const value = useMemo<AppContextValue>(() => ({
    ...scopedState,
    palette: { ...palette, radius: colors.radius },
    isDark,
    offlineSession,
    t: (key: string) => {
      const languageCopy = copy[scopedState.language] ?? copy.en;
      const text = languageCopy[key] ?? extendedMessage(scopedState.language, key) ?? copy.en[key] ?? key;
      const userFacingText = standardizeVisibleBrand(text.replaceAll('RevenueCat', subscriptionProviderLabels[state.language]));
      return bucketLabelKeys.has(key) ? userFacingText.charAt(0).toLocaleUpperCase() + userFacingText.slice(1) : userFacingText;
    },
     addTransaction: (transaction) => setState((current) => ({ ...current, transactions: [{ ...transaction, id: makeId() }, ...current.transactions] })),
     updateTransaction: (id, transaction) => setState((current) => ({
       ...current,
       transactions: current.transactions.map((item) => item.id === id ? { ...transaction, id } : item),
     })),
    removeTransaction: (id) => setState((current) => ({ ...current, transactions: current.transactions.filter((item) => item.id !== id) })),
      addIncome: (amount, type = 'other') => setState((current) => ({
       ...current,
       income: current.income + amount,
       incomeEntries: [{ id: makeId(), amount, type, date: new Date().toISOString().slice(0, 10) }, ...current.incomeEntries],
     })),
      removeIncome: (id) => setState((current) => {
        const entry = current.incomeEntries.find((item) => item.id === id);
        if (!entry) return current;
        return {
          ...current,
          income: Math.max(0, current.income - entry.amount),
          incomeEntries: current.incomeEntries.filter((item) => item.id !== id),
        };
      }),
     addGoal: (goal, allowMultiple = false) => setState((current) => {
        if (!allowMultiple && current.goals.length >= 1) return current;
       return {
         ...current,
         goals: [...current.goals, { ...goal, id: makeId(), createdAt: new Date().toISOString(), status: 'active' }],
       };
     }),
     updateGoal: (id, goal) => setState((current) => ({
       ...current,
       goals: current.goals.map((item) => item.id === id ? { ...item, ...goal } : item),
     })),
     completeGoal: (id) => setState((current) => ({
       ...current,
       goals: current.goals.map((item) => item.id === id ? { ...item, status: 'completed' } : item),
     })),
     removeGoal: (id) => setState((current) => ({ ...current, goals: current.goals.filter((item) => item.id !== id) })),
    addBucket: (label, percent) => setState((current) => {
      const cleanLabel = label.trim();
      if (!cleanLabel) return current;
      const id = `custom-${makeId()}`;
      const withNewBucket = [...current.buckets, { id, labelKey: cleanLabel, icon: 'folder-outline', percent: 0, tone: 'fun' as const }];
      return {
        ...current,
        buckets: rebalanceAroundBucket(withNewBucket, id, percent),
      };
    }),
    updateBucket: (id, label) => setState((current) => {
      const cleanLabel = label.trim();
      if (!cleanLabel) return current;
      return {
        ...current,
        buckets: current.buckets.map((bucket) => bucket.id === id ? { ...bucket, labelKey: cleanLabel } : bucket),
      };
    }),
    removeBucket: (id) => setState((current) => {
      if (current.buckets.length <= 1) return current;
      const remaining = current.buckets.filter((bucket) => bucket.id !== id);
      if (remaining.length === current.buckets.length) return current;
      const removedPercent = current.buckets.find((bucket) => bucket.id === id)?.percent ?? 0;
      const share = Math.floor(removedPercent / remaining.length);
      let remainder = removedPercent - share * remaining.length;
      const buckets = remaining.map((bucket) => {
        const increase = share + (remainder > 0 ? 1 : 0);
        remainder = Math.max(0, remainder - 1);
        return { ...bucket, percent: bucket.percent + increase };
      });
      const fallbackId = buckets[0].id;
      return {
        ...current,
        buckets,
        transactions: current.transactions.map((transaction) =>
          transaction.bucketId === id ? { ...transaction, bucketId: fallbackId } : transaction),
      };
    }),
    setBucketPercent: (id, percent) => setState((current) => ({
      ...current,
      buckets: rebalanceAroundBucket(current.buckets, id, percent),
    })),
    setLanguage: (language) => setState((current) => ({ ...current, language })),
    setThemeMode: (themeMode) => setState((current) => ({ ...current, themeMode })),
    setMorningReminder: (morningReminder) => setState((current) => ({ ...current, morningReminder })),
    setEveningReminder: (eveningReminder) => setState((current) => ({ ...current, eveningReminder })),
    setProfileImageUri: (profileImageUri) => setState((current) => ({ ...current, profileImageUri })),
    setProfileFirstName: (profileFirstName) => setState((current) => ({ ...current, profileFirstName })),
    setCountry: (countryCode) => setState((current) => {
      const selected = countries.find((country) => country.code === countryCode) ?? countries[0];
      return {
        ...current,
        countryCode,
        currency: selected.currency,
        buckets: createDefaultBuckets(selected.taxPercent),
      };
    }),
    setCurrency: (currency) => setState((current) => ({ ...current, currency })),
     refreshRates,
     hasCurrentRate: (() => {
       const updatedAt = scopedState.ratesUpdatedAt;
       return scopedState.currency === 'AED' || (Number.isFinite(scopedState.rates[scopedState.currency]) && Boolean(scopedState.rates[scopedState.currency]) && Boolean(updatedAt) && Date.now() - new Date(updatedAt!).getTime() <= 7 * 24 * 60 * 60 * 1000);
     })(),
     formatMoney: (amountInAed) => {
       const rate = scopedState.currency === 'AED' ? 1 : scopedState.rates[scopedState.currency];
       if (!hasUsableRate(rate, scopedState.ratesUpdatedAt, scopedState.currency !== 'AED')) return `${scopedState.currency} —`;
       const converted = Math.abs(amountInAed) * rate!;
      return `${scopedState.currency} ${converted.toLocaleString(localeByLanguage[scopedState.language], {
        minimumFractionDigits: scopedState.currency === 'JPY' ? 0 : 2,
        maximumFractionDigits: scopedState.currency === 'JPY' ? 0 : 2,
      })}`;
    },
     formatTransactionMoney: (transaction) => {
       const currentRate = scopedState.currency === 'AED' ? 1 : scopedState.rates[scopedState.currency];
       if (!Number.isFinite(transaction.originalAmount) && !hasUsableRate(currentRate, scopedState.ratesUpdatedAt, scopedState.currency !== 'AED')) return `${scopedState.currency} —`;
       const amount = Number.isFinite(transaction.originalAmount) ? transaction.originalAmount! : Math.abs(transaction.amount) * currentRate!;
      const code = transaction.originalCurrency || scopedState.currency;
      return `${code} ${Math.abs(amount).toLocaleString(localeByLanguage[scopedState.language], {
        minimumFractionDigits: code === 'JPY' ? 0 : 2,
        maximumFractionDigits: code === 'JPY' ? 0 : 2,
      })}`;
    },
    formatNumber: (value, options) => new Intl.NumberFormat(localeByLanguage[scopedState.language], options).format(value),
    formatPercent: (value) => new Intl.NumberFormat(localeByLanguage[scopedState.language], { style: 'percent', maximumFractionDigits: 0 }).format(value / 100),
    formatDate: (value, options = { year: 'numeric', month: 'short', day: 'numeric' }) =>
      new Intl.DateTimeFormat(localeByLanguage[scopedState.language], options).format(typeof value === 'string' ? new Date(`${value}T12:00:00`) : value),
     toBaseAmount: (displayAmount) => {
       const rate = scopedState.currency === 'AED' ? 1 : scopedState.rates[scopedState.currency];
       if (!hasUsableRate(rate, scopedState.ratesUpdatedAt, scopedState.currency !== 'AED')) return Number.NaN;
       return displayAmount / rate!;
     },
    completeOnboarding: (answers) => setState((current) => ({ ...current, onboardingAnswers: answers ?? current.onboardingAnswers, onboardingComplete: true })),
    resetOnboarding: () => setState((current) => ({ ...current, onboardingComplete: false })),
    clearHistory: () => setState((current) => ({
      ...current,
      income: 0,
       incomeEntries: [],
      transactions: [],
      buckets: createDefaultBuckets(countries.find((country) => country.code === current.countryCode)?.taxPercent ?? 0),
    })),
    startOver: async () => {
      const resetState = createInitialState();
      if (scopedUserId) {
        // Remove the old record first so account deletion cannot leave the
        // previous user's financial data available if the replacement write
        // is interrupted.
        await AsyncStorage.removeItem(accountStorageKey(scopedUserId));
        await AsyncStorage.setItem(accountStorageKey(scopedUserId), JSON.stringify(resetState));
      }
      setState(resetState);
    },
  }), [isDark, offlineSession, palette, scopedState, scopedUserId]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useVigil() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useVigil must be used inside VigilProvider');
  return value;
}