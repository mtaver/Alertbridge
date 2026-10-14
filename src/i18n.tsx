import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Answer, Category, OutcomeConfirmation, Status } from './types'

export type Language = 'en' | 'ha'
const STORAGE_KEY = 'alertbridge-language'

const ha: Record<string, string> = {
  'language.label': 'Harshe', 'language.english': 'English', 'language.hausa': 'Hausa — daftari', 'language.draftNotice': 'Fassarar Hausa daftari ce; ana jiran dubawar ƙwararren mai magana da Hausa.',
  'nav.home': 'Gida', 'nav.alerts': 'Sanarwar al’umma', 'nav.report': 'Kai rahoton faruwa', 'nav.reports': 'Rahotannina', 'nav.responder': 'Allon masu amsa', 'nav.account': 'Asusu', 'nav.signIn': 'Shiga', 'nav.signOut': 'Fita',
  'common.back': 'Koma baya', 'common.refresh': 'Sabunta', 'common.cancel': 'Soke', 'common.save': 'Ajiye', 'common.saving': 'Ana ajiyewa…', 'common.loading': 'Ana lodawa…', 'common.yes': 'Eh', 'common.no': 'A’a', 'common.unsure': 'Ban tabbata ba',
  'report.heading': 'Me kake son ka kai rahoto a kai?', 'report.help': 'Zaɓi hanyar da ta fi maka sauƙi. An nuna filayen da ake bukata da *.',
  'report.community': 'Gargaɗi al’umma', 'report.communityNote': 'Buga gargaɗin da ba a tabbatar ba don jama’a su gani', 'report.assistance': 'Nemi taimakon gaggawa', 'report.assistanceNote': 'Aika buƙata ta sirri ga masu amsa da aka ba izini', 'report.both': 'Duka biyun', 'report.bothNote': 'Ƙirƙiri bayanan jama’a da na sirri masu alaƙa cikin aminci',
  'report.method': 'Ta yaya kake son kai rahoto?', 'report.guided': 'Tambayoyin jagora', 'report.guidedNote': 'Za mu yi tambaya ɗaya mai sauƙi a lokaci guda', 'report.written': 'Rubuta rahoto', 'report.writtenNote': 'Bayyana abin da ya faru da kalmominka',
  'report.category': 'Nau’in faruwa', 'report.description': 'Bayyana abin da ya faru', 'report.happening': 'Yana faruwa yanzu?', 'report.injured': 'Akwai wanda ya ji rauni?', 'report.where': 'Ina abin ya faru?', 'report.details': 'Ƙarin bayani na zaɓi', 'report.review': 'Duba rahoto',
  'report.useLocation': 'Yi amfani da wurina na yanzu', 'report.elsewhere': 'Abin ya faru a wani wuri', 'report.locationHelp': 'Yi amfani da wannan idan abin yana faruwa inda kake.', 'report.advanced': 'Na gaba: shigar da latitude da longitude da hannu',
  'category.Security threat': 'Barazanar tsaro', 'category.Flood': 'Ambaliya', 'category.Landslide': 'Zaftarewar ƙasa', 'category.Fire': 'Gobara', 'category.Other': 'Wani abu',
  'status.Unverified': 'Ba a tabbatar ba', 'status.Under review': 'Ana dubawa', 'status.Verified': 'An tabbatar', 'status.Rejected': 'An ƙi', 'status.Resolved': 'An warware',
  'message.title': 'Tattaunawa ta sirri', 'message.private': 'Mai rahoto da masu amsa da aka ba izini ne kawai za su iya karanta saƙonnin nan.', 'message.placeholder': 'Rubuta saƙo na sirri…', 'message.send': 'Aika saƙo', 'message.sent': 'An aika', 'message.none': 'Babu saƙonni tukuna.', 'message.reporter': 'Mai rahoto', 'message.responder': 'Mai amsa',
  'outcome.title': 'An kula da matsalarka?', 'outcome.responder': 'Sakamakon da mai amsa ya bayar', 'outcome.reporter': 'Tabbacin mai rahoto', 'outcome.awaiting': 'Ana jiran tabbacin mai rahoto', 'outcome.followUp': 'Ana buƙatar ƙarin dubawa', 'outcome.received': 'An samu taimako', 'outcome.partial': 'An magance wani ɓangare', 'outcome.notReceived': 'Ba a samu taimako ba', 'outcome.cannotConfirm': 'Ba zan iya tabbatarwa ba', 'outcome.comment': 'Sharhi na zaɓi', 'outcome.save': 'Ajiye tabbaci',
  'push.title': 'Bi sanarwar yanki', 'push.description': 'Karɓi gajerun sanarwa game da faɗakarwar da mai amsa ya tabbatar a yankunan da ka zaɓa.', 'push.areas': 'Yankunan da za a bi', 'push.enable': 'Kunna sanarwa', 'push.disable': 'Kashe sanarwa', 'push.save': 'Ajiye yankunan da ake bi', 'push.limits': 'Iyakokin burauza da isarwa',
  'push.unsupported': 'Wannan burauzar ko na’urar ba ta goyon bayan sanarwar yanar gizo.', 'push.noAreas': 'Ba a saita yankunan sanarwa ba tukuna.', 'push.signIn': 'Shiga domin kunna sanarwa. Har yanzu ana iya karanta sanarwar jama’a ba tare da shiga ba.', 'push.enabled': 'An kunna sanarwa ga yankunan da aka zaɓa.', 'push.updated': 'An sabunta yankunan da ake bi.', 'push.disabled': 'An kashe sanarwa a wannan na’urar.', 'push.permission': 'Dole ne a ba da izini a kowace na’ura. Bukatun shigar da manhaja sun bambanta da burauza da tsarin na’ura. Isarwa ya dogara da sabis na sanarwar burauza, hanyar sadarwa da saitunan na’ura, saboda haka ba a tabbatar da isarwa ko isowarta nan take ba. Wannan ba ya amfani da GPS a bango ba tare da tsayawa ba kuma ba ya tuntuɓar hukumomin gaggawa.',
  'error.generic': 'An sami matsala. Da fatan za a sake gwadawa.', 'error.technical': 'Bayanan fasaha', 'error.authTechnical': 'Ba a iya kammala aikin asusu ba. Duba bayananka sannan ka sake gwadawa.', 'error.dataTechnical': 'Ba a iya kammala buƙatar ba. Bayananka ba su ɓace ba; da fatan za a sake gwadawa.', 'error.notificationTechnical': 'Ba a iya sabunta saitunan sanarwa ba. Da fatan za a sake gwadawa.',
  'home.eyebrow': 'TSARON AL’UMMA, TARE', 'home.title': 'Taimako yana farawa da sauraronka.', 'home.intro': 'AlertBridge yana taimaka wa al’umma su raba barazanar tsaro da bala’o’i cikin sauƙi, sauri da madaidaicin wuri.', 'home.report': 'Kai rahoton faruwa', 'home.steps': 'Matakai masu sauƙi. Rubutu mai bayyana. Za ka duba kafin aikawa.',
  'auth.signIn': 'Shiga', 'auth.create': 'Ƙirƙiri asusu', 'auth.reset': 'Sake saita kalmar sirri', 'auth.newPassword': 'Zaɓi sabuwar kalmar sirri', 'auth.notice': 'Asusunka yana adana rahotanni a AlertBridge. Wannan ba ya sanar da hukumomin gaggawa.', 'auth.name': 'Sunan da za a nuna', 'auth.email': 'Adireshin imel', 'auth.password': 'Kalmar sirri', 'auth.sendReset': 'Aika imel na sake saiti', 'auth.updatePassword': 'Sabunta kalmar sirri', 'auth.wait': 'Da fatan za a jira…', 'auth.existing': 'Ina da asusu', 'auth.forgot': 'An manta kalmar sirri?', 'auth.nameUpdated': 'An sabunta sunan da ake nuna.', 'auth.saveName': 'Ajiye sunan da ake nuna',
  'review.title': 'Duba rahotanka', 'review.help': 'Tabbatar cewa bayanan nan daidai ne kafin aikawa.', 'review.edit': 'Gyara bayanai', 'review.submit': 'Aika zuwa AlertBridge', 'review.channel': 'Hanyar rahoto', 'review.method': 'Hanyar rubutawa', 'review.what': 'Abin da ke faruwa', 'confirmation.title': 'An aika rahotanka.', 'confirmation.label': 'AN AIKA ZUWA ALERTBRIDGE', 'confirmation.notice': 'Ma’adanar AlertBridge ta karɓi rahoton. Ba a sanar da hukumomin gaggawa ba.',
  'alerts.title': 'Sanarwar al’umma', 'alerts.intro': 'Gargaɗin al’umma da sanarwar da mai amsa ya tabbatar. Ba a haɗa AlertBridge da hukumomin gaggawa ba.', 'alerts.category': 'Nau’i', 'alerts.area': 'Yankin da abin ya shafa', 'alerts.past': 'Nuna tsofaffin sanarwa', 'alerts.map': 'Taswirar haɗari', 'alerts.nearby': 'Gargaɗin haɗari na kusa', 'alerts.enableNearby': 'Kunna gargaɗin kusa', 'alerts.disableNearby': 'Kashe gargaɗin kusa', 'alerts.includeUnverified': 'Haɗa gargaɗin al’umma da ba a tabbatar ba', 'alerts.reportedNearby': 'An bayar da rahoton haɗari a kusa. Ka guji yankin da abin ya shafa kuma ka duba shawarwarin.', 'alerts.destination': 'Duba sanarwa kusa da wurin da za a je', 'alerts.notSafe': 'Ba a sami yankin haɗari da ya dace ba. Wannan ba yana nufin yankin yana da aminci ba.',
  'dashboard.reports': 'Rahotannin faruwa', 'dashboard.refresh': 'Sabunta jerin', 'dashboard.reviewPosts': 'Duba rubuce-rubucen jama’a', 'dashboard.all': 'Duk rahotanni', 'dashboard.needsReview': 'Masu buƙatar dubawa', 'dashboard.active': 'Ana dubawa', 'dashboard.updateStatus': 'Sabunta matsayi', 'dashboard.reason': 'Dalili', 'dashboard.saveStatus': 'Ajiye canjin matsayi',
  'assistance.title': 'Daidaita taimako', 'assistance.notice': 'Karɓa a AlertBridge, amincewar mai amsa, tabbatarwa, miƙawa ga hukuma da warwarewa abubuwa ne daban. Rubuta miƙawa yana adana abin da aka riga aka yi; ba ya aika saƙo ga hukuma ko tura taimako.', 'assistance.action': 'Aiki', 'assistance.note': 'Bayani', 'assistance.ack': 'An amince da karɓa', 'assistance.coordination': 'Bayanin daidaitawa', 'assistance.forwarded': 'An miƙa ga hukuma', 'assistance.agency': 'Hukumar da aka tuntuɓa', 'assistance.time': 'Lokacin miƙawa', 'assistance.reference': 'Lambar bayani', 'assistance.record': 'Ajiye aiki', 'assistance.none': 'Ba a rubuta amincewa ko aikin daidaitawa ba.',
  'validation.required': 'Ana buƙatar wannan fili.', 'validation.coordinates': 'Shigar da latitude daga −90 zuwa 90 da longitude daga −180 zuwa 180.', 'error.auth': 'Shiga ya gaza. Da fatan za a sake gwadawa.', 'error.load': 'Ba a iya loda bayanai ba. Sake gwadawa.',
  'a11y.openNavigation': 'Buɗe menu', 'a11y.mapLegend': 'Bayanin alamomin taswira', 'a11y.nearbyWarnings': 'Gargaɗin haɗari na kusa',
}

interface I18nValue { language: Language; locale: string; setLanguage: (value: Language) => void; t: (key: string, fallback?: string) => string }
const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem(STORAGE_KEY) === 'ha' ? 'ha' : 'en')
  useEffect(() => { localStorage.setItem(STORAGE_KEY, language); document.documentElement.lang = language }, [language])
  const value = useMemo<I18nValue>(() => ({ language, locale: language === 'ha' ? 'ha-NG' : 'en-NG', setLanguage, t: (key, fallback = key) => language === 'ha' ? (ha[key] ?? fallback) : fallback }), [language])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() { const value = useContext(I18nContext); if (!value) throw new Error('I18nProvider is missing.'); return value }
export function categoryLabel(category: Category, t: I18nValue['t']) { return t(`category.${category}`, category) }
export function answerLabel(answer: Answer, t: I18nValue['t']) { return answer === 'Yes' ? t('common.yes', answer) : answer === 'No' ? t('common.no', answer) : t('common.unsure', answer) }
export function statusLabel(status: Status, t: I18nValue['t']) { return t(`status.${status}`, status) }
export function outcomeLabel(value: OutcomeConfirmation, t: I18nValue['t']) { return value === 'Assistance received' ? t('outcome.received', value) : value === 'Partly addressed' ? t('outcome.partial', value) : value === 'Assistance not received' ? t('outcome.notReceived', value) : t('outcome.cannotConfirm', value) }

const haAppText: Record<string, string> = {
  'Choose how you want to report.': 'Zaɓi yadda kake son kai rahoto.',
  'Choose an incident category.': 'Zaɓi nau’in faruwa.',
  'Tell us what is happening.': 'Faɗa mana abin da ke faruwa.',
  'Enter a description.': 'Shigar da bayani.',
  'Choose an answer.': 'Zaɓi amsa.',
  'Enter the public affected area.': 'Shigar da yankin jama’a da abin ya shafa.',
  'Enter a public summary.': 'Shigar da taƙaitaccen bayanin jama’a.',
  'Choose a future expiry time.': 'Zaɓi lokacin ƙarewa na gaba.',
  'Enter a radius greater than 0 and no more than 50 km.': 'Shigar da radius da ya fi 0 amma bai wuce kilomita 50 ba.',
  'Enter a valid latitude.': 'Shigar da latitude mai inganci.',
  'Latitude must be between −90 and 90.': 'Latitude dole ya kasance tsakanin −90 da 90.',
  'Enter a valid longitude.': 'Shigar da longitude mai inganci.',
  'Longitude must be between −180 and 180.': 'Longitude dole ya kasance tsakanin −180 da 180.',
  'Enter a valid public danger-zone latitude.': 'Shigar da latitude mai inganci na yankin haɗarin jama’a.',
  'Public latitude must be between −90 and 90.': 'Latitude na jama’a dole ya kasance tsakanin −90 da 90.',
  'Enter a valid public danger-zone longitude.': 'Shigar da longitude mai inganci na yankin haɗarin jama’a.',
  'Public longitude must be between −180 and 180.': 'Longitude na jama’a dole ya kasance tsakanin −180 da 180.',
  'Enter a message.': 'Shigar da saƙo.',
  'Messages must be 2000 characters or fewer.': 'Saƙonni dole su kasance haruffa 2000 ko ƙasa da haka.',
  'Sent': 'An aika',
  'Live': 'Kai tsaye',
  'Reconnecting': 'Ana sake haɗawa',
  'Loading conversation…': 'Ana loda tattaunawa…',
  'Sending…': 'Ana aikawa…',
  'Saving…': 'Ana ajiyewa…',
}

export function localizeAppText(text: string, language: Language) { return language === 'ha' ? (haAppText[text] ?? text) : text }

export function LanguageSelector() {
  const { language, setLanguage, t } = useI18n()
  return <div className="language-control"><label className="language-selector"><span>{t('language.label', 'Language')}</span><select aria-label={t('language.label', 'Language')} aria-describedby={language === 'ha' ? 'hausa-draft-notice' : undefined} value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="en">English</option><option value="ha">Hausa — draft</option></select></label>{language === 'ha' && <span id="hausa-draft-notice" className="language-draft-notice">{t('language.draftNotice', 'Hausa translation is a draft; fluent-speaker review is pending.')}</span>}</div>
}
