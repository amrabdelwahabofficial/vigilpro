import type { Language } from '@/context/AppContext';
function standardizeVisibleBrand(text: string): string {
  return text
    .replaceAll('Vigil — Know Where It All Goes', 'Vigil Spend')
    .replaceAll('Vigil Know Where It All Goes', 'Vigil Spend')
    .replaceAll('Vigil-Pro', 'Vigil Spend Pro')
    .replaceAll('Vigil Pro', 'Vigil Spend Pro')
    .replace(/\bVIGIL\b/g, 'Vigil Spend')
    .replace(/\bVigil\b(?!\s+Spend)/g, 'Vigil Spend');
}

function standardizeVisibleBrandCopy<T>(value: T): T {
  if (typeof value === 'string') return standardizeVisibleBrand(value) as T;
  if (Array.isArray(value)) return value.map((item) => standardizeVisibleBrandCopy(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, standardizeVisibleBrandCopy(item)]),
    ) as T;
  }
  return value;
}

type SupportCopy = {
  helpSupport: string;
  helpSupportCopy: string;
  supportTitle: string;
  supportIntro: string;
  faqTitle: string;
  faqSearch: string;
  contactTitle: string;
  contactCopy: string;
  category: string;
  subject: string;
  subjectPlaceholder: string;
  message: string;
  messagePlaceholder: string;
  attachment: string;
  addImage: string;
  removeImage: string;
  privacyNote: string;
  sendRequest: string;
  sending: string;
  requestSent: string;
  requestSentCopy: string;
  backToSupport: string;
  missingSubject: string;
  missingMessage: string;
  submitError: string;
  imageTooLarge: string;
  categories: Record<string, string>;
  faqs: { question: string; answer: string }[];
  supportEmail: string;
  adminSubscribers: string;
  adminSupport: string;
  adminSupportTitle: string;
  adminRefresh: string;
  adminNoRequests: string;
  adminNoRequestsCopy: string;
  adminStatus: string;
  adminSubmitted: string;
  adminAttachment: string;
  adminAccount: string;
  adminMessage: string;
};

const en: SupportCopy = {
  helpSupport: 'Help & Support',
  helpSupportCopy: 'Find answers or send a request to the Vigil team.',
  supportTitle: 'Help & Support',
  supportIntro: 'Search the answers below, or tell us what you need. Your request stays inside Vigil.',
  faqTitle: 'Frequently asked questions',
  faqSearch: 'Search help topics',
  contactTitle: 'Contact support',
  contactCopy: 'We include only your account email, user ID, app version, iOS version, language, and Free/Pro status. Never include passwords, tokens, transactions, or financial amounts.',
  category: 'Category',
  subject: 'Subject',
  subjectPlaceholder: 'What can we help with?',
  message: 'Message',
  messagePlaceholder: 'Tell us what happened and what you need.',
  attachment: 'Screenshot (optional)',
  addImage: 'Add screenshot',
  removeImage: 'Remove image',
  privacyNote: 'Vigil stores this request securely for the support team. Replies are handled at your account email.',
  sendRequest: 'Send request',
  sending: 'Sending…',
  requestSent: 'Request sent.',
  requestSentCopy: 'We’ve received your request and will contact you at your account email.',
  backToSupport: 'Back to Help & Support',
  missingSubject: 'Add a subject first.',
  missingMessage: 'Add a little more detail to your message.',
  submitError: 'We could not save your request. Please try again.',
  imageTooLarge: 'Choose an image under 2 MB.',
  categories: { Account: 'Account', Subscription: 'Subscription', Transactions: 'Transactions', 'Technical Issue': 'Technical Issue', Feedback: 'Feedback', Other: 'Other' },
  faqs: [
    { question: 'Where is my financial data stored?', answer: 'Your plans, income, transactions, and onboarding answers stay in local app storage on your device. Vigil does not connect to your bank accounts.' },
    { question: 'What does Vigil Pro unlock?', answer: 'Pro adds voice, receipt, and bank-message capture, custom planning tools, currency-aware planning, and full Analysis insights.' },
    { question: 'How do I manage or cancel my subscription?', answer: 'Subscriptions are managed by Apple. Open your Apple subscription settings to review, change, or cancel a plan.' },
    { question: 'Can I delete my account or start over?', answer: 'Settings lets you clear local data and start over, or permanently delete your account. Deleting your account does not cancel an Apple subscription.' },
  ],
  supportEmail: 'Official support: support@vigilspend.com',
  adminSubscribers: 'Subscribers',
  adminSupport: 'Support Requests',
  adminSupportTitle: 'Support Requests',
  adminRefresh: 'Refresh',
  adminNoRequests: 'No support requests',
  adminNoRequestsCopy: 'New requests will appear here after users submit them in Vigil.',
  adminStatus: 'Status',
  adminSubmitted: 'Submitted',
  adminAttachment: 'Attachment',
  adminAccount: 'Account',
  adminMessage: 'Message',
};

const translations: Record<Exclude<Language, 'en'>, SupportCopy> = {
  fr: {
    ...en, helpSupport: 'Aide et assistance', helpSupportCopy: 'Trouvez des réponses ou envoyez une demande à l’équipe Vigil.', supportTitle: 'Aide et assistance', supportIntro: 'Recherchez une réponse ou dites-nous ce dont vous avez besoin. Votre demande reste dans Vigil.', faqTitle: 'Questions fréquentes', faqSearch: 'Rechercher dans l’aide', contactTitle: 'Contacter l’assistance', contactCopy: 'Nous joignons uniquement l’e-mail du compte, l’identifiant utilisateur, la version de l’app, la version iOS, la langue et le statut Free/Pro. N’incluez jamais de mots de passe, jetons, transactions ou montants.', category: 'Catégorie', subject: 'Objet', subjectPlaceholder: 'Comment pouvons-nous vous aider ?', message: 'Message', messagePlaceholder: 'Dites-nous ce qui s’est passé et ce dont vous avez besoin.', attachment: 'Capture d’écran (facultatif)', addImage: 'Ajouter une capture', removeImage: 'Supprimer l’image', privacyNote: 'Vigil stocke cette demande de façon sécurisée. Les réponses sont envoyées à l’e-mail de votre compte.', sendRequest: 'Envoyer la demande', sending: 'Envoi…', requestSent: 'Demande envoyée.', requestSentCopy: 'Nous avons reçu votre demande et vous contacterons à l’adresse e-mail de votre compte.', backToSupport: 'Retour à l’aide', missingSubject: 'Ajoutez un objet.', missingMessage: 'Ajoutez un peu plus de détails.', submitError: 'Impossible d’enregistrer votre demande. Réessayez.', imageTooLarge: 'Choisissez une image de moins de 2 Mo.', categories: { Account: 'Compte', Subscription: 'Abonnement', Transactions: 'Transactions', 'Technical Issue': 'Problème technique', Feedback: 'Commentaires', Other: 'Autre' }, faqs: en.faqs, supportEmail: 'Assistance officielle : support@vigilspend.com', adminSubscribers: 'Abonnés', adminSupport: 'Demandes d’assistance', adminSupportTitle: 'Demandes d’assistance', adminRefresh: 'Actualiser', adminNoRequests: 'Aucune demande', adminNoRequestsCopy: 'Les nouvelles demandes apparaîtront ici.', adminStatus: 'Statut', adminSubmitted: 'Envoyée', adminAttachment: 'Pièce jointe', adminAccount: 'Compte', adminMessage: 'Message',
  },
  cs: {
    ...en, helpSupport: 'Nápověda a podpora', helpSupportCopy: 'Najděte odpovědi nebo napište týmu Vigil.', supportTitle: 'Nápověda a podpora', supportIntro: 'Vyhledejte odpověď nebo nám řekněte, co potřebujete. Žádost zůstane ve Vigil.', faqTitle: 'Časté dotazy', faqSearch: 'Hledat v nápovědě', contactTitle: 'Kontaktovat podporu', contactCopy: 'Přidáme jen e-mail účtu, ID uživatele, verzi aplikace, verzi iOS, jazyk a stav Free/Pro. Nikdy neposílejte hesla, tokeny, transakce ani částky.', category: 'Kategorie', subject: 'Předmět', subjectPlaceholder: 'S čím vám můžeme pomoci?', message: 'Zpráva', messagePlaceholder: 'Popište, co se stalo a co potřebujete.', attachment: 'Snímek obrazovky (volitelné)', addImage: 'Přidat snímek', removeImage: 'Odebrat obrázek', privacyNote: 'Vigil tuto žádost bezpečně uloží pro podporu. Odpověď přijde na e-mail účtu.', sendRequest: 'Odeslat žádost', sending: 'Odesílání…', requestSent: 'Žádost odeslána.', requestSentCopy: 'Žádost jsme přijali a ozveme se na e-mail vašeho účtu.', backToSupport: 'Zpět na nápovědu', missingSubject: 'Přidejte předmět.', missingMessage: 'Přidejte více podrobností.', submitError: 'Žádost se nepodařilo uložit. Zkuste to znovu.', imageTooLarge: 'Vyberte obrázek menší než 2 MB.', categories: { Account: 'Účet', Subscription: 'Předplatné', Transactions: 'Transakce', 'Technical Issue': 'Technický problém', Feedback: 'Zpětná vazba', Other: 'Jiné' }, faqs: en.faqs, supportEmail: 'Oficiální podpora: support@vigilspend.com', adminSubscribers: 'Předplatitelé', adminSupport: 'Žádosti podpory', adminSupportTitle: 'Žádosti podpory', adminRefresh: 'Obnovit', adminNoRequests: 'Žádné žádosti', adminNoRequestsCopy: 'Nové žádosti se zobrazí po odeslání ve Vigil.', adminStatus: 'Stav', adminSubmitted: 'Odesláno', adminAttachment: 'Příloha', adminAccount: 'Účet', adminMessage: 'Zpráva',
  },
  de: {
    ...en, helpSupport: 'Hilfe und Support', helpSupportCopy: 'Finden Sie Antworten oder senden Sie dem Vigil-Team eine Anfrage.', supportTitle: 'Hilfe und Support', supportIntro: 'Suchen Sie nach Antworten oder sagen Sie uns, was Sie brauchen. Ihre Anfrage bleibt in Vigil.', faqTitle: 'Häufige Fragen', faqSearch: 'Hilfe durchsuchen', contactTitle: 'Support kontaktieren', contactCopy: 'Wir senden nur Konto-E-Mail, Benutzer-ID, App-Version, iOS-Version, Sprache und Free/Pro-Status mit. Senden Sie niemals Passwörter, Token, Transaktionen oder Beträge.', category: 'Kategorie', subject: 'Betreff', subjectPlaceholder: 'Wobei können wir helfen?', message: 'Nachricht', messagePlaceholder: 'Was ist passiert und was brauchen Sie?', attachment: 'Screenshot (optional)', addImage: 'Screenshot hinzufügen', removeImage: 'Bild entfernen', privacyNote: 'Vigil speichert diese Anfrage sicher für das Support-Team. Antworten gehen an Ihre Konto-E-Mail.', sendRequest: 'Anfrage senden', sending: 'Wird gesendet…', requestSent: 'Anfrage gesendet.', requestSentCopy: 'Wir haben Ihre Anfrage erhalten und melden uns an Ihrer Konto-E-Mail.', backToSupport: 'Zurück zur Hilfe', missingSubject: 'Fügen Sie einen Betreff hinzu.', missingMessage: 'Fügen Sie weitere Details hinzu.', submitError: 'Die Anfrage konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.', imageTooLarge: 'Wählen Sie ein Bild unter 2 MB.', categories: { Account: 'Konto', Subscription: 'Abo', Transactions: 'Transaktionen', 'Technical Issue': 'Technisches Problem', Feedback: 'Feedback', Other: 'Andere' }, faqs: en.faqs, supportEmail: 'Offizieller Support: support@vigilspend.com', adminSubscribers: 'Abonnenten', adminSupport: 'Support-Anfragen', adminSupportTitle: 'Support-Anfragen', adminRefresh: 'Aktualisieren', adminNoRequests: 'Keine Support-Anfragen', adminNoRequestsCopy: 'Neue Anfragen erscheinen nach dem Senden in Vigil.', adminStatus: 'Status', adminSubmitted: 'Gesendet', adminAttachment: 'Anhang', adminAccount: 'Konto', adminMessage: 'Nachricht',
  },
  es: {
    ...en, helpSupport: 'Ayuda y soporte', helpSupportCopy: 'Encuentra respuestas o envía una solicitud al equipo de Vigil.', supportTitle: 'Ayuda y soporte', supportIntro: 'Busca respuestas o cuéntanos qué necesitas. Tu solicitud permanece en Vigil.', faqTitle: 'Preguntas frecuentes', faqSearch: 'Buscar en la ayuda', contactTitle: 'Contactar con soporte', contactCopy: 'Solo incluimos el correo de la cuenta, el ID de usuario, la versión de la app, la versión de iOS, el idioma y el estado Free/Pro. Nunca incluyas contraseñas, tokens, transacciones ni importes.', category: 'Categoría', subject: 'Asunto', subjectPlaceholder: '¿En qué podemos ayudarte?', message: 'Mensaje', messagePlaceholder: 'Cuéntanos qué ocurrió y qué necesitas.', attachment: 'Captura de pantalla (opcional)', addImage: 'Añadir captura', removeImage: 'Quitar imagen', privacyNote: 'Vigil guarda esta solicitud de forma segura. Las respuestas se gestionan en el correo de tu cuenta.', sendRequest: 'Enviar solicitud', sending: 'Enviando…', requestSent: 'Solicitud enviada.', requestSentCopy: 'Hemos recibido tu solicitud y te contactaremos en el correo de tu cuenta.', backToSupport: 'Volver a ayuda', missingSubject: 'Añade un asunto.', missingMessage: 'Añade más detalles.', submitError: 'No se pudo guardar la solicitud. Inténtalo de nuevo.', imageTooLarge: 'Elige una imagen de menos de 2 MB.', categories: { Account: 'Cuenta', Subscription: 'Suscripción', Transactions: 'Transacciones', 'Technical Issue': 'Problema técnico', Feedback: 'Comentarios', Other: 'Otro' }, faqs: en.faqs, supportEmail: 'Soporte oficial: support@vigilspend.com', adminSubscribers: 'Suscriptores', adminSupport: 'Solicitudes de soporte', adminSupportTitle: 'Solicitudes de soporte', adminRefresh: 'Actualizar', adminNoRequests: 'No hay solicitudes', adminNoRequestsCopy: 'Las nuevas solicitudes aparecerán aquí tras enviarlas en Vigil.', adminStatus: 'Estado', adminSubmitted: 'Enviada', adminAttachment: 'Adjunto', adminAccount: 'Cuenta', adminMessage: 'Mensaje',
  },
  ru: {
    ...en, helpSupport: 'Помощь и поддержка', helpSupportCopy: 'Найдите ответ или отправьте запрос команде Vigil.', supportTitle: 'Помощь и поддержка', supportIntro: 'Найдите ответ или расскажите, что вам нужно. Запрос останется внутри Vigil.', faqTitle: 'Частые вопросы', faqSearch: 'Поиск в справке', contactTitle: 'Связаться с поддержкой', contactCopy: 'Мы добавляем только почту аккаунта, ID пользователя, версию приложения, версию iOS, язык и статус Free/Pro. Не отправляйте пароли, токены, операции или суммы.', category: 'Категория', subject: 'Тема', subjectPlaceholder: 'Чем мы можем помочь?', message: 'Сообщение', messagePlaceholder: 'Расскажите, что произошло и что вам нужно.', attachment: 'Снимок экрана (необязательно)', addImage: 'Добавить снимок', removeImage: 'Удалить изображение', privacyNote: 'Vigil безопасно сохранит запрос для поддержки. Ответ придёт на почту аккаунта.', sendRequest: 'Отправить запрос', sending: 'Отправка…', requestSent: 'Запрос отправлен.', requestSentCopy: 'Мы получили запрос и свяжемся с вами по почте аккаунта.', backToSupport: 'Назад к помощи', missingSubject: 'Добавьте тему.', missingMessage: 'Добавьте больше деталей.', submitError: 'Не удалось сохранить запрос. Повторите попытку.', imageTooLarge: 'Выберите изображение меньше 2 МБ.', categories: { Account: 'Аккаунт', Subscription: 'Подписка', Transactions: 'Операции', 'Technical Issue': 'Техническая проблема', Feedback: 'Отзыв', Other: 'Другое' }, faqs: en.faqs, supportEmail: 'Официальная поддержка: support@vigilspend.com', adminSubscribers: 'Подписчики', adminSupport: 'Запросы поддержки', adminSupportTitle: 'Запросы поддержки', adminRefresh: 'Обновить', adminNoRequests: 'Нет запросов', adminNoRequestsCopy: 'Новые запросы появятся после отправки в Vigil.', adminStatus: 'Статус', adminSubmitted: 'Отправлен', adminAttachment: 'Вложение', adminAccount: 'Аккаунт', adminMessage: 'Сообщение',
  },
  ar: {
    ...en, helpSupport: 'المساعدة والدعم', helpSupportCopy: 'اعثر على إجابات أو أرسل طلباً إلى فريق Vigil.', supportTitle: 'المساعدة والدعم', supportIntro: 'ابحث عن إجابة أو أخبرنا بما تحتاجه. يبقى طلبك داخل Vigil.', faqTitle: 'الأسئلة الشائعة', faqSearch: 'ابحث في المساعدة', contactTitle: 'تواصل مع الدعم', contactCopy: 'نضيف فقط بريد الحساب ومعرّف المستخدم وإصدار التطبيق وإصدار iOS واللغة وحالة Free/Pro. لا ترسل كلمات المرور أو الرموز أو المعاملات أو المبالغ أبداً.', category: 'الفئة', subject: 'الموضوع', subjectPlaceholder: 'كيف يمكننا مساعدتك؟', message: 'الرسالة', messagePlaceholder: 'أخبرنا بما حدث وما تحتاج إليه.', attachment: 'لقطة شاشة (اختيارية)', addImage: 'إضافة لقطة شاشة', removeImage: 'إزالة الصورة', privacyNote: 'يحفظ Vigil هذا الطلب بأمان لفريق الدعم. تتم معالجة الردود عبر بريد حسابك.', sendRequest: 'إرسال الطلب', sending: 'جارٍ الإرسال…', requestSent: 'تم إرسال الطلب.', requestSentCopy: 'تلقينا طلبك وسنتواصل معك عبر بريد حسابك.', backToSupport: 'العودة إلى المساعدة', missingSubject: 'أضف موضوعاً أولاً.', missingMessage: 'أضف مزيداً من التفاصيل.', submitError: 'تعذر حفظ طلبك. حاول مجدداً.', imageTooLarge: 'اختر صورة أقل من 2 ميغابايت.', categories: { Account: 'الحساب', Subscription: 'الاشتراك', Transactions: 'المعاملات', 'Technical Issue': 'مشكلة تقنية', Feedback: 'ملاحظات', Other: 'أخرى' }, faqs: en.faqs, supportEmail: 'الدعم الرسمي: support@vigilspend.com', adminSubscribers: 'المشتركون', adminSupport: 'طلبات الدعم', adminSupportTitle: 'طلبات الدعم', adminRefresh: 'تحديث', adminNoRequests: 'لا توجد طلبات دعم', adminNoRequestsCopy: 'ستظهر الطلبات الجديدة بعد إرسالها من داخل Vigil.', adminStatus: 'الحالة', adminSubmitted: 'تاريخ الإرسال', adminAttachment: 'المرفق', adminAccount: 'الحساب', adminMessage: 'الرسالة',
  },
};

export function supportText(language: Language, key: keyof SupportCopy): string {
  const copy = language === 'en' ? en : translations[language];
  return standardizeVisibleBrand(String(copy[key] ?? en[key]));
}

export function supportCopy(language: Language): SupportCopy {
  return standardizeVisibleBrandCopy(language === 'en' ? en : translations[language]);
}