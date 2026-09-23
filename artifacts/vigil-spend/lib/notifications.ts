import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Language } from '@/context/AppContext';

const MANAGED_IDS_KEY = '@vigil/managed-notification-ids';
const ANDROID_CHANNEL_ID = 'vigil-reminders';
const INACTIVITY_DAYS = 3;
const REMINDER_TIMES = {
  morning: { hour: 8, minute: 0 },
  evening: { hour: 20, minute: 30 },
};

const copy: Record<Language, {
  morningTitle: string;
  morningBody: string;
  eveningTitle: string;
  eveningBody: string;
  inactivityTitle: string;
  inactivityBody: string;
  channelName: string;
}> = {
  en: {
    morningTitle: 'A clear start',
    morningBody: 'Take a moment to log yesterday’s spending before the day gets loud.',
    eveningTitle: 'Close the loop',
    eveningBody: 'A quick spending log now can make tomorrow’s plan feel lighter.',
    inactivityTitle: 'Make logging easier',
    inactivityBody: 'No spending logged for a few days? Pair logging with coffee or setting your alarm.',
    channelName: 'Vigil Spend reminders',
  },
  fr: {
    morningTitle: 'Un début plus clair',
    morningBody: 'Prenez un moment pour noter les dépenses d’hier avant que la journée ne commence.',
    eveningTitle: 'Fermez la boucle',
    eveningBody: 'Noter rapidement vos dépenses peut alléger le plan de demain.',
    inactivityTitle: 'Simplifiez la saisie',
    inactivityBody: 'Aucune dépense notée depuis quelques jours ? Associez la saisie au café ou au réglage de votre alarme.',
    channelName: 'Rappels Vigil Spend',
  },
  cs: {
    morningTitle: 'Jasný začátek',
    morningBody: 'Než se den rozběhne, věnujte chvíli zapsání včerejších výdajů.',
    eveningTitle: 'Uzavřete den',
    eveningBody: 'Krátký záznam výdajů teď může zítřejší plán odlehčit.',
    inactivityTitle: 'Usnadněte si záznamy',
    inactivityBody: 'Několik dní bez záznamu? Spojte zapisování s kávou nebo nastavením budíku.',
    channelName: 'Připomínky Vigil Spend',
  },
  de: {
    morningTitle: 'Klarer Start',
    morningBody: 'Nimm dir einen Moment, um die Ausgaben von gestern zu erfassen, bevor der Tag laut wird.',
    eveningTitle: 'Den Tag abschließen',
    eveningBody: 'Ein kurzer Ausgaben-Check kann den Plan für morgen leichter machen.',
    inactivityTitle: 'Erfassen leichter machen',
    inactivityBody: 'Seit ein paar Tagen nichts erfasst? Verbinde das Erfassen mit Kaffee oder dem Stellen des Weckers.',
    channelName: 'Erinnerungen von Vigil Spend',
  },
  es: {
    morningTitle: 'Un comienzo claro',
    morningBody: 'Tómate un momento para registrar los gastos de ayer antes de que empiece el día.',
    eveningTitle: 'Cierra el ciclo',
    eveningBody: 'Registrar rápidamente tus gastos puede hacer más ligero el plan de mañana.',
    inactivityTitle: 'Haz que registrar sea más fácil',
    inactivityBody: '¿Llevas unos días sin registrar gastos? Únelo al café o al momento de poner la alarma.',
    channelName: 'Recordatorios de Vigil Spend',
  },
  ru: {
    morningTitle: 'Ясное начало',
    morningBody: 'Найдите минуту, чтобы записать вчерашние расходы до начала насыщенного дня.',
    eveningTitle: 'Завершите день',
    eveningBody: 'Короткая запись расходов сейчас поможет облегчить план на завтра.',
    inactivityTitle: 'Упростите записи',
    inactivityBody: 'Несколько дней без записей? Свяжите их с кофе или установкой будильника.',
    channelName: 'Напоминания Vigil Spend',
  },
  ar: {
    morningTitle: 'بداية أوضح',
    morningBody: 'خذ لحظة لتسجيل مصروفات الأمس قبل أن يبدأ يومك المزدحم.',
    eveningTitle: 'أغلق الحلقة',
    eveningBody: 'يمكن لتسجيل سريع لمصروفاتك الآن أن يجعل خطة الغد أسهل.',
    inactivityTitle: 'اجعل التسجيل أسهل',
    inactivityBody: 'لم تسجل مصروفات منذ بضعة أيام؟ اربط التسجيل بالقهوة أو بضبط المنبه.',
    channelName: 'تذكيرات Vigil Spend',
  },
};

const notificationVariants: Record<Language, {
  morning: string[];
  evening: string[];
  inactivity: string[];
}> = {
  en: {
    morning: ['Take a moment to log yesterday’s spending before the day gets loud.', 'A quick look at yesterday can make today’s choices clearer.', 'Start the day with a calm check-in on what you spent.'],
    evening: ['A quick spending log now can make tomorrow’s plan feel lighter.', 'Before the day ends, give your spending a simple check-in.', 'A minute with today’s spending can make tomorrow easier to plan.'],
    inactivity: ['No spending logged for a few days? Pair logging with coffee or setting your alarm.', 'Nothing logged lately? A small check-in can keep your history useful.', 'A quiet spending history is okay. Add what you remember when you have a moment.'],
  },
  fr: {
    morning: ['Prenez un moment pour noter les dépenses d’hier avant que la journée ne commence.', 'Un rapide regard sur hier peut clarifier les choix d’aujourd’hui.', 'Commencez la journée par un point calme sur vos dépenses.'],
    evening: ['Noter rapidement vos dépenses peut alléger le plan de demain.', 'Avant la fin de la journée, faites un point simple sur vos dépenses.', 'Une minute pour noter vos dépenses facilite le plan de demain.'],
    inactivity: ['Aucune dépense notée depuis quelques jours ? Associez la saisie au café ou au réglage de votre alarme.', 'Rien de noté récemment ? Un petit point peut garder votre historique utile.', 'Un historique calme est normal. Ajoutez ce dont vous vous souvenez quand vous aurez un moment.'],
  },
  cs: {
    morning: ['Než se den rozběhne, věnujte chvíli zapsání včerejších výdajů.', 'Krátký pohled na včerejšek může zpřehlednit dnešní rozhodnutí.', 'Začněte den klidnou kontrolou toho, za co jste utráceli.'],
    evening: ['Krátký záznam výdajů teď může zítřejší plán odlehčit.', 'Než den skončí, udělejte si jednoduchý přehled dnešních výdajů.', 'Minuta věnovaná dnešním výdajům usnadní plán na zítřek.'],
    inactivity: ['Několik dní bez záznamu? Spojte zapisování s kávou nebo nastavením budíku.', 'Dlouho nic nezapsáno? Krátká kontrola udrží historii užitečnou.', 'Klidnější historie je v pořádku. Až budete mít chvíli, doplňte, co si pamatujete.'],
  },
  de: {
    morning: ['Nimm dir einen Moment, um die Ausgaben von gestern zu erfassen, bevor der Tag laut wird.', 'Ein kurzer Blick auf gestern kann heutige Entscheidungen klarer machen.', 'Starte den Tag mit einem ruhigen Blick auf deine Ausgaben.'],
    evening: ['Ein kurzer Ausgaben-Check kann den Plan für morgen leichter machen.', 'Bevor der Tag endet, wirf einen einfachen Blick auf deine Ausgaben.', 'Eine Minute für die heutigen Ausgaben macht morgen leichter planbar.'],
    inactivity: ['Seit ein paar Tagen nichts erfasst? Verbinde das Erfassen mit Kaffee oder dem Stellen des Weckers.', 'Länger nichts eingetragen? Ein kurzer Check hält deine Historie nützlich.', 'Eine ruhige Historie ist in Ordnung. Ergänze deine Erinnerung, wenn du Zeit hast.'],
  },
  es: {
    morning: ['Tómate un momento para registrar los gastos de ayer antes de que empiece el día.', 'Un vistazo rápido a ayer puede aclarar las decisiones de hoy.', 'Empieza el día revisando tus gastos con calma.'],
    evening: ['Registrar rápidamente tus gastos puede hacer más ligero el plan de mañana.', 'Antes de terminar el día, revisa tus gastos de forma sencilla.', 'Un minuto con los gastos de hoy facilita planear mañana.'],
    inactivity: ['¿Llevas unos días sin registrar gastos? Únelo al café o al momento de poner la alarma.', '¿Hace tiempo que no registras nada? Un pequeño repaso mantiene útil tu historial.', 'Un historial tranquilo está bien. Añade lo que recuerdes cuando tengas un momento.'],
  },
  ru: {
    morning: ['Найдите минуту, чтобы записать вчерашние расходы до начала насыщенного дня.', 'Короткий взгляд на вчера поможет яснее принимать решения сегодня.', 'Начните день со спокойной проверки своих расходов.'],
    evening: ['Короткая запись расходов сейчас поможет облегчить план на завтра.', 'Перед концом дня сделайте простой обзор сегодняшних расходов.', 'Минута на сегодняшние расходы упростит планирование завтра.'],
    inactivity: ['Несколько дней без записей? Свяжите их с кофе или установкой будильника.', 'Давно ничего не записывали? Небольшая проверка сохранит историю полезной.', 'Спокойная история — это нормально. Добавьте то, что помните, когда будет минутка.'],
  },
  ar: {
    morning: ['خذ لحظة لتسجيل مصروفات الأمس قبل أن يبدأ يومك المزدحم.', 'نظرة سريعة إلى الأمس قد تجعل قرارات اليوم أوضح.', 'ابدأ يومك بمراجعة هادئة لمصروفاتك.'],
    evening: ['يمكن لتسجيل سريع لمصروفاتك الآن أن يجعل خطة الغد أسهل.', 'قبل نهاية اليوم، ألقِ نظرة بسيطة على مصروفاتك.', 'دقيقة واحدة مع مصروفات اليوم تجعل التخطيط للغد أسهل.'],
    inactivity: ['لم تسجل مصروفات منذ بضعة أيام؟ اربط التسجيل بالقهوة أو بضبط المنبه.', 'لم تسجل شيئاً مؤخراً؟ تساعدك مراجعة صغيرة في إبقاء سجلك مفيداً.', 'لا بأس بسجل هادئ. أضف ما تتذكره عندما يتوفر لديك وقت.'],
  },
};

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function cancelManagedNotifications() {
  if (Platform.OS === 'web') return;
  const raw = await AsyncStorage.getItem(MANAGED_IDS_KEY);
  const ids = raw ? JSON.parse(raw) as string[] : [];
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
  await AsyncStorage.removeItem(MANAGED_IDS_KEY);
}

async function hasNotificationPermission() {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (current.status === Notifications.PermissionStatus.DENIED) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

function nextInactivityDate(latestTransactionDate: string) {
  const parsed = new Date(`${latestTransactionDate}T09:00:00`);
  const due = new Date(parsed.getTime() + INACTIVITY_DAYS * 24 * 60 * 60 * 1000);
  return due.getTime() > Date.now() ? due : new Date(Date.now() + 60 * 60 * 1000);
}

export async function cancelReminderNotifications() {
  await cancelManagedNotifications();
}

export async function syncReminderNotifications({
  morning,
  evening,
  latestTransactionDate,
  language,
}: {
  morning: boolean;
  evening: boolean;
  latestTransactionDate: string | null;
  language: Language;
}) {
  if (Platform.OS === 'web') return;
  await cancelManagedNotifications();
  if (!morning && !evening) return;
  if (!(await hasNotificationPermission())) return;

  const messages = copy[language] ?? copy.en;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: messages.channelName,
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  }

  const ids: string[] = [];
  const channelId = Platform.OS === 'android' ? ANDROID_CHANNEL_ID : undefined;
  const schedule = async (content: Notifications.NotificationContentInput, trigger: Notifications.SchedulableNotificationTriggerInput) => {
    ids.push(await Notifications.scheduleNotificationAsync({ content, trigger }));
  };
  const upcomingDailyDates = (hour: number, minute: number) => {
    const dates: Date[] = [];
    for (let offset = 0; dates.length < 7; offset += 1) {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      date.setHours(hour, minute, 0, 0);
      if (date.getTime() > Date.now() + 30_000) dates.push(date);
    }
    return dates;
  };
  const scheduleDailyVariants = async (title: string, bodies: string[], type: string, hour: number, minute: number) => {
    const dates = upcomingDailyDates(hour, minute);
    await Promise.all(dates.map((date, index) => schedule({
      title,
      body: bodies[index % bodies.length],
      sound: 'default',
      data: { type },
      ...(channelId ? { channelId } : {}),
    }, {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      ...(channelId ? { channelId } : {}),
    })));
  };
  const variants = notificationVariants[language] ?? notificationVariants.en;

  if (morning) {
    await scheduleDailyVariants(messages.morningTitle, variants.morning, 'morning-reminder', REMINDER_TIMES.morning.hour, REMINDER_TIMES.morning.minute);
  }

  if (evening) {
    await scheduleDailyVariants(messages.eveningTitle, variants.evening, 'evening-reminder', REMINDER_TIMES.evening.hour, REMINDER_TIMES.evening.minute);
  }

  if (latestTransactionDate && (morning || evening)) {
    await schedule({
      title: messages.inactivityTitle,
      body: variants.inactivity[0],
      sound: 'default',
      data: { type: 'inactivity-reminder' },
      ...(channelId ? { channelId } : {}),
    }, {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: nextInactivityDate(latestTransactionDate),
      ...(channelId ? { channelId } : {}),
    });
  }

  await AsyncStorage.setItem(MANAGED_IDS_KEY, JSON.stringify(ids));
}