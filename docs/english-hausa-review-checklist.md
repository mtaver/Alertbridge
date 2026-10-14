# AlertBridge English/Hausa review checklist

Status: **Draft — not approved for production**

## Browser review status — 12 October 2026

- PASS — English/Hausa selector updates the visible sign-in labels and `document.lang`.
- PASS — text entered in the sign-in form remains present when switching English → Hausa.
- PASS — the sign-in screen remains readable and operable at a 390 px viewport and at a 1280 px desktop viewport.
- PASS — required-field behavior is exposed accessibly by the browser.
- NOT TESTED — signed-in reporting, edited public-summary preservation, review/confirmation, messaging, outcome feedback and notification controls. The browser session was signed out and no real report was submitted.
- NOT TESTED — expandable raw Supabase/database technical details in a live failure. Automated coverage verifies the disclosure component, but no database failure was deliberately triggered.

Observed English app text in the Hausa view is listed under **Remaining untranslated or partly translated items** below. Hausa remains a draft pending fluent-speaker review.

Instructions for the fluent Hausa reviewer:

- Review meaning, clarity for different literacy levels, tone and safety implications.
- Enter revised Hausa wording in **Reviewer correction** when needed.
- Enter reviewer name/initials, decision and date in **Approval**.
- Do not approve wording that implies agency receipt, dispatch, guaranteed delivery, verification or safety when AlertBridge cannot establish it.

## Priority 1 — reporting and assistance

| English text | Draft Hausa translation | Where it appears | Reviewer correction | Approval |
| --- | --- | --- | --- | --- |
| What would you like to report? | Me kake son ka kai rahoto a kai? | New incident report heading |  | Reviewer / decision / date: |
| Warn the community | Gargaɗi al’umma | Reporting-channel choice |  |  |
| Publish an unverified warning for public viewing | Buga gargaɗin da ba a tabbatar ba don jama’a su gani | Community-channel explanation |  |  |
| Request emergency assistance | Nemi taimakon gaggawa | Reporting-channel choice |  |  |
| Send a private request to authorised responders | Aika buƙata ta sirri ga masu amsa da aka ba izini | Private-assistance explanation |  |  |
| Both | Duka biyun | Combined reporting-channel choice |  |  |
| Guided questions | Tambayoyin jagora | Reporting-method choice |  |  |
| Write a report | Rubuta rahoto | Reporting-method choice |  |  |
| What is happening? | Me ke faruwa? | Guided report question |  |  |
| Is it happening now? | Yana faruwa yanzu? | Guided report question |  |  |
| Is anyone injured? | Akwai wanda ya ji rauni? | Guided report question |  |  |
| Yes / No / Not sure | Eh / A’a / Ban tabbata ba | Guided answer choices |  |  |
| Where is the incident? | Ina abin ya faru? | Incident location section |  |  |
| Use this if the incident is happening where you are. | Yi amfani da wannan idan abin yana faruwa inda kake. | GPS-location explanation |  |  |
| Use my current location | Yi amfani da wurina na yanzu | GPS action |  |  |
| Incident is somewhere else | Abin ya faru a wani wuri | Alternate-location action |  |  |
| Additional details (optional) | Ƙarin bayani (na zaɓi) | Guided report form |  |  |
| Review report | Duba rahoto | Report form action |  |  |
| Emergency services are not connected. | Ba a haɗa da hukumomin agajin gaggawa ba. | Footer, report notices and confirmations |  |  |
| This does not notify or dispatch emergency services. | Wannan ba ya aika sanarwa ko tura jami’an agajin gaggawa. | Assistance and messaging notices |  |  |
| Help starts with being heard. | Taimako yana farawa da sauraronka. | Home hero |  |  |
| Sign in | Shiga | Authentication and navigation |  |  |
| Create an account | Ƙirƙiri asusu | Authentication |  |  |
| Reset your password | Sake saita kalmar sirri | Authentication |  |  |
| Display name | Sunan da za a nuna | Sign-up and account profile |  |  |
| Email address | Adireshin imel | Authentication |  |  |
| Password | Kalmar sirri | Authentication |  |  |
| Review your report | Duba rahotanka | Final report review |  |  |
| Submit to AlertBridge | Aika zuwa AlertBridge | Final report submission |  |  |
| Your report has been submitted. | An aika rahotanka. | Submission confirmation |  |  |
| Assistance coordination | Daidaita taimako | Private report detail |  |  |
| Forwarded to agency | An miƙa ga hukuma | Assistance action |  |  |
| Agency actually contacted | Hukumar da aka tuntuɓa | Agency-handoff record |  |  |

## Priority 2 — verification and outcomes

| English text | Draft Hausa translation | Where it appears | Reviewer correction | Approval |
| --- | --- | --- | --- | --- |
| Unverified | Ba a tabbatar ba | New reports and community posts |  |  |
| Under review | Ana dubawa | Private report status |  |  |
| Verified | An tabbatar | Report and alert verification label |  |  |
| Rejected | An ƙi | Private report status |  |  |
| Resolved | An warware | Report and alert activity status |  |  |
| Community report — unverified | Rahoton al’umma — ba a tabbatar ba | Public warning cards |  |  |
| Responder-verified | Mai amsa ya tabbatar | Public alert cards and map legend |  |  |
| Reported by a community member. Not yet confirmed by a responder. | Wani ɗan al’umma ne ya bayar da rahoton. Mai amsa bai tabbatar da shi ba tukuna. | Unverified public guidance |  |  |
| Was your issue attended to? | An kula da matsalarka? | Reporter outcome section |  |  |
| Awaiting reporter confirmation | Ana jiran tabbacin mai rahoto | Reporter and responder dashboards |  |  |
| Assistance received | An samu taimako | Reporter outcome option |  |  |
| Partly addressed | An magance wani ɓangare | Reporter outcome option |  |  |
| Assistance not received | Ba a samu taimako ba | Reporter outcome option |  |  |
| Cannot confirm | Ba zan iya tabbatarwa ba | Reporter outcome option |  |  |
| Follow-up required | Ana buƙatar ƙarin dubawa | Responder dashboard |  |  |

## Priority 3 — nearby warnings and notification limits

| English text | Draft Hausa translation | Where it appears | Reviewer correction | Approval |
| --- | --- | --- | --- | --- |
| Enable nearby warnings | Kunna gargaɗin haɗari na kusa | Community Alerts location control |  |  |
| Include unverified community warnings | Haɗa gargaɗin al’umma da ba a tabbatar ba | Warning-source option |  |  |
| Reported danger nearby. Avoid the affected area and review guidance. | An bayar da rahoton haɗari a kusa. Ka guji yankin da abin ya shafa kuma ka duba shawarwarin. | Foreground proximity warning |  |  |
| No matching public danger zones were found. This does not mean the area is safe. | Ba a sami yankin haɗarin jama’a da ya dace ba. Wannan ba yana nufin yankin yana da aminci ba. | Nearby and destination empty state |  |  |
| Follow area alerts | Bi sanarwar yanki | Web Push settings |  |  |
| Enable notifications | Kunna sanarwa | Web Push action |  |  |
| Disable notifications | Kashe sanarwa | Web Push action |  |  |
| Delivery is not guaranteed or always immediate. | Ba a tabbatar da isarwa ba, kuma ba lallai ta iso nan take ba. | Notification limitations |  |  |
| This does not use continuous background GPS. | Wannan ba ya amfani da GPS a bango ba tare da tsayawa ba. | Notification limitations |  |  |
| Nearby warnings work only while this page is open. | Gargaɗin kusa yana aiki ne kawai yayin da wannan shafin yake a buɗe. | Foreground-warning explanation |  |  |
| Place search is currently unavailable. | Neman wuri ba ya samuwa a yanzu. | Map and destination selector |  |  |
| Community alerts | Sanarwar al’umma | Public feed heading |  |  |
| Danger map | Taswirar haɗari | Public feed map |  |  |
| Check alerts near a destination | Duba sanarwa kusa da wurin da za a je | Destination check |  |  |
| Refresh | Sabunta | Feed, messaging and dashboard controls |  |  |

## Existing draft coverage

- Language selector, persistence and document language.
- Main navigation labels.
- Reporting-channel and reporting-method choices.
- Categories and guided Yes/No/Not sure choices.
- Hausa generated-summary templates.
- Core report statuses in the report list.
- Private conversation heading, author roles, timestamps and primary controls.
- Reporter outcome options, follow-up flag and outcome timestamps.
- Main Web Push headings and actions.

## Validation, errors and notices — draft review

| English text | Draft Hausa translation | Where it appears | Reviewer correction | Approval |
| --- | --- | --- | --- | --- |
| Choose how you want to report. | Zaɓi yadda kake son kai rahoto. | Reporting validation |  |  |
| Choose an incident category. | Zaɓi nau’in faruwa. | Reporting validation |  |  |
| Tell us what is happening. | Faɗa mana abin da ke faruwa. | Guided-report validation |  |  |
| Enter a description. | Shigar da bayani. | Written-report validation |  |  |
| Choose an answer. | Zaɓi amsa. | Guided Yes/No/Not sure validation |  |  |
| Enter the public affected area. | Shigar da yankin jama’a da abin ya shafa. | Community-warning validation |  |  |
| Enter a public summary. | Shigar da taƙaitaccen bayanin jama’a. | Community-warning validation |  |  |
| Choose a future expiry time. | Zaɓi lokacin ƙarewa na gaba. | Community-warning validation |  |  |
| Enter a radius greater than 0 and no more than 50 km. | Shigar da radius da ya fi 0 amma bai wuce kilomita 50 ba. | Danger-zone validation |  |  |
| Latitude must be between −90 and 90. | Latitude dole ya kasance tsakanin −90 da 90. | Coordinate validation |  |  |
| Longitude must be between −180 and 180. | Longitude dole ya kasance tsakanin −180 da 180. | Coordinate validation |  |  |
| Enter a message. | Shigar da saƙo. | Private-message validation |  |  |
| Messages must be 2000 characters or fewer. | Saƙonni dole su kasance haruffa 2000 ko ƙasa da haka. | Private-message validation |  |  |
| We could not complete the account request. Check your details and try again. | Ba a iya kammala aikin asusu ba. Duba bayananka sannan ka sake gwadawa. | Localised explanation above authentication technical details |  |  |
| We could not complete the request. Your entries are still here; please retry. | Ba a iya kammala buƙatar ba. Bayananka ba su ɓace ba; da fatan za a sake gwadawa. | Localised report/message error explanation |  |  |
| Technical details | Bayanan fasaha | Expandable raw provider/database error details |  |  |
| This browser or device does not support Web Push. | Wannan burauzar ko na’urar ba ta goyon bayan sanarwar yanar gizo. | Notification settings |  |  |
| Notifications enabled for the selected areas. | An kunna sanarwa ga yankunan da aka zaɓa. | Notification success notice |  |  |
| Notifications disabled on this device. | An kashe sanarwa a wannan na’urar. | Notification success notice |  |  |

Raw Supabase, browser, network and database messages are diagnostic text, not translated app copy. The interface must show a clear localised explanation first and place the unchanged raw text under the expandable **Technical details / Bayanan fasaha** control. Reviewers should review the explanation, not translate provider error payloads.

## Remaining untranslated or partly translated items

This is **not complete localisation**. The following remain wholly or partly English and must be added after review:

- Some home feature explanations and the account-required callout.
- Reporting helper paragraphs, placeholders and some GPS status messages.
- Some review field labels and channel-specific safety notices.
- Community Alert connection states, individual card metadata, moderation controls and destination helper copy.
- Responder dashboard explanatory paragraphs and public-alert publishing form details.
- Some assistance success/error messages and stored action-type labels.
- Some messaging connection states and long explanatory notices.
- Some outcome instructions, responder action labels and success/error notices.
- A small number of browser-specific notification permission messages emitted outside the settings panel.
- Service-unavailable and application-error explanatory screens.
- Raw Supabase, browser, network, provider and database diagnostics remain in their original language by design and must only appear under localised technical-detail disclosures.
- Date and number formatting outside message and outcome-history timestamps.
- Accessible labels not yet routed through the translation dictionary, including map controls and some icon-only controls.

## Release gate

- [ ] Fluent Hausa reviewer has corrected every Priority 1 phrase.
- [ ] Fluent Hausa reviewer has corrected every Priority 2 phrase.
- [ ] Fluent Hausa reviewer has corrected every Priority 3 phrase.
- [ ] Corrected wording has been implemented consistently in visible text and accessibility labels.
- [ ] English fallback and user-authored-content preservation have been retested.
- [ ] Mobile layout has been manually reviewed in both languages.
- [ ] Reviewer name, approval decision and date are recorded.
