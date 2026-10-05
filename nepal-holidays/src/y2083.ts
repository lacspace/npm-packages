import type { RawEntry } from "./types.js";

/**
 * BS 2083 (14 Apr 2026 – 13 Apr 2027), transcribed from the Ministry of Home Affairs notice
 * in Nepal Rajpatra, Khanda 75, Sankhya 67, Bhag 5, published 2082-11-18. `wd` is the weekday
 * the notice prints next to each date; the tests check every date's conversion against it.
 * `null` dates are ones the notice leaves to the day ("… का दिन").
 */
export const Y2083: RawEntry[] = [
  // 2.1 Festival holidays, nationwide
  { id: "new-year", sec: "2.1(क)", ne: "नव वर्ष", en: "Nepali New Year", bs: [1, 1], wd: 2, kind: "public-holiday", cat: "festival", scope: "national" },
  { id: "chandi-purnima", sec: "2.1(ख)", ne: "चण्डी पूर्णिमा (वैशाख पूर्णिमा) – किराँत समुदायको उभौली पर्व", en: "Chandi Purnima (Baisakh Purnima) – Ubhauli of the Kirat community", bs: [1, 18], wd: 5, kind: "public-holiday", cat: "festival", scope: "national" },
  { id: "raksha-bandhan", sec: "2.1(ग)", ne: "रक्षाबन्धन", en: "Raksha Bandhan (Janai Purnima)", bs: [5, 12], wd: 5, kind: "public-holiday", cat: "festival", scope: "national" },
  { id: "janmashtami", sec: "2.1(घ)", ne: "श्रीकृष्ण जन्माष्टमी", en: "Shree Krishna Janmashtami", bs: [5, 19], wd: 5, kind: "public-holiday", cat: "festival", scope: "national" },
  { id: "ghatasthapana", sec: "2.1(ङ)", ne: "घटस्थापना", en: "Ghatasthapana", bs: [6, 25], wd: 0, kind: "public-holiday", cat: "festival", scope: "national" },
  { id: "dashain", sec: "2.1(च)", ne: "दशैं बिदा (फूलपातीदेखि द्वादशीसम्म)", en: "Dashain holidays (Fulpati to Dwadashi)", bs: [6, 31], wd: 6, to: [7, 6], toWd: 5, kind: "public-holiday", cat: "festival", scope: "national" },
  { id: "tihar", sec: "2.1(छ)", ne: "तिहार बिदा (लक्ष्मीपूजादेखि भाइटिकाको भोलिपल्टसम्म)", en: "Tihar holidays (Laxmi Puja to the day after Bhai Tika)", bs: [7, 22], wd: 0, to: [7, 26], toWd: 4, kind: "public-holiday", cat: "festival", scope: "national" },
  { id: "chhath", sec: "2.1(ज)", ne: "छठ पर्व", en: "Chhath", bs: [7, 29], wd: 0, kind: "public-holiday", cat: "festival", scope: "national" },
  { id: "dhanya-purnima", sec: "2.1(झ)", ne: "धान्य पूर्णिमा – किराँत समुदायको उधौली पर्व, योमरी पुन्हि, ज्यापू दिवस", en: "Dhanya Purnima – Udhauli of the Kirat community, Yomari Punhi, Jyapu Day", bs: [9, 9], wd: 4, kind: "public-holiday", cat: "festival", scope: "national" },
  { id: "christmas", sec: "2.1(ञ)", ne: "क्रिसमस डे (डिसेम्बर २५)", en: "Christmas Day (25 December)", bs: [9, 10], wd: 5, kind: "public-holiday", cat: "festival", scope: "national" },
  { id: "tamu-lhosar", sec: "2.1(ट)", ne: "तमू ल्होछार", en: "Tamu Lhosar", bs: [9, 15], wd: 3, kind: "public-holiday", cat: "festival", scope: "national" },
  { id: "maghe-sankranti", sec: "2.1(ठ)", ne: "माघी पर्व / माघे सङ्क्रान्ति", en: "Maghi / Maghe Sankranti", bs: [10, 1], wd: 5, kind: "public-holiday", cat: "festival", scope: "national" },
  { id: "sonam-lhosar", sec: "2.1(ड)", ne: "सोनम ल्होछार", en: "Sonam Lhosar", bs: [10, 24], wd: 0, kind: "public-holiday", cat: "festival", scope: "national" },
  { id: "maha-shivaratri", sec: "2.1(ढ)", ne: "महाशिवरात्री", en: "Maha Shivaratri", bs: [11, 22], wd: 6, kind: "public-holiday", cat: "festival", scope: "national" },
  { id: "gyalpo-lhosar", sec: "2.1(ण)", ne: "ग्याल्पो ल्होसार", en: "Gyalpo Lhosar", bs: [11, 25], wd: 2, kind: "public-holiday", cat: "festival", scope: "national" },
  { id: "eid-ul-fitr", sec: "2.1(त)", ne: "ईद (ईद उल फित्र)", en: "Eid (Eid al-Fitr)", bs: null, kind: "public-holiday", cat: "festival", scope: "national" },
  { id: "eid-ul-adha", sec: "2.1(थ)", ne: "बकर ईद (ईद उल अजहा)", en: "Bakar Eid (Eid al-Adha)", bs: null, kind: "public-holiday", cat: "festival", scope: "national" },
  { id: "fagu-purnima-hill", sec: "2.1(द)", ne: "फागुपूर्णिमा (हिमाली र पहाडी ५६ जिल्ला)", en: "Fagu Purnima (Holi), 56 mountain and hill districts", bs: [12, 7], wd: 0, kind: "public-holiday", cat: "festival", scope: "regional", region: "hill" },
  { id: "fagu-purnima-terai", sec: "2.1(द)", ne: "फागुपूर्णिमा (तराईका २१ जिल्ला)", en: "Fagu Purnima (Holi), 21 Terai districts", bs: [12, 8], wd: 1, kind: "public-holiday", cat: "festival", scope: "regional", region: "terai" },
  // 2.2 For the related religion, culture or area only
  { id: "gaijatra-newar", sec: "2.2(क)", ne: "गाईजात्रा (देशभरका नेवार समुदायका लागि मात्र)", en: "Gai Jatra (Newar community nationwide only)", bs: [5, 13], wd: 6, kind: "public-holiday", cat: "jatra", scope: "community", community: { en: "Newar community", ne: "नेवार समुदाय" } },
  { id: "gaura-parva", sec: "2.2(ख)", ne: "गौरा पर्व", en: "Gaura Parva", bs: [5, 19], wd: 5, kind: "public-holiday", cat: "festival", scope: "community", community: { en: "Those who celebrate it (the notice names no area)", ne: "सम्बन्धित समुदाय (सूचनामा क्षेत्र तोकिएको छैन)" } },
  { id: "dura-mhaipru-nakuma", sec: "2.2(ग)", ne: "दुरा म्हैप्रु नकुमा (देशभरका दुरा समुदायका लागि मात्र)", en: "Dura Mhaipru Nakuma (Dura community nationwide only)", bs: [9, 15], wd: 3, kind: "public-holiday", cat: "festival", scope: "community", community: { en: "Dura community", ne: "दुरा समुदाय" } },
  { id: "sirua-pawani", sec: "2.2(घ)", ne: "सिरुवा पावनी (झापा, मोरङ, सुनसरी, सिराहा र सप्तरी)", en: "Sirua Pawani (Jhapa, Morang, Sunsari, Siraha and Saptari)", bs: null, kind: "public-holiday", cat: "festival", scope: "regional", districts: ["Jhapa", "Morang", "Sunsari", "Siraha", "Saptari"] },
  // 3. Women employees only
  { id: "teej", sec: "3(क)", ne: "हरितालिका (तीज) व्रत", en: "Haritalika Teej", bs: [5, 29], wd: 1, kind: "public-holiday", cat: "festival", scope: "women" },
  { id: "jitiya", sec: "3(ख)", ne: "जितिया पर्व (जितिया पर्व मनाउने महिला कर्मचारीको लागि)", en: "Jitiya (women employees who observe it)", bs: [6, 18], wd: 0, kind: "public-holiday", cat: "festival", scope: "women" },
  // 4. Educational institutions only
  { id: "vasant-panchami", sec: "4", ne: "वसन्त पञ्चमी", en: "Vasant Panchami (Saraswati Puja)", bs: [10, 28], wd: 4, kind: "public-holiday", cat: "festival", scope: "education" },
  // 5. Jatras, Kathmandu Valley only
  { id: "gaijatra-valley", sec: "5(क)", ne: "गाईजात्रा (काठमाडौं उपत्यका)", en: "Gai Jatra (Kathmandu Valley)", bs: [5, 13], wd: 6, kind: "public-holiday", cat: "jatra", scope: "regional", region: "kathmandu-valley" },
  { id: "indra-jatra", sec: "5(ख)", ne: "इन्द्रजात्रा (काठमाडौं उपत्यका)", en: "Indra Jatra (Kathmandu Valley)", bs: [6, 9], wd: 5, kind: "public-holiday", cat: "jatra", scope: "regional", region: "kathmandu-valley" },
  { id: "bhoto-jatra", sec: "5(ग)", ne: "मत्स्येन्द्रनाथको भोटो देखाउने जात्रा (काठमाडौं उपत्यका)", en: "Bhoto Jatra of Machhindranath (Kathmandu Valley)", bs: null, kind: "public-holiday", cat: "jatra", scope: "regional", region: "kathmandu-valley" },
  { id: "ghode-jatra", sec: "5(घ)", ne: "घोडेजात्रा (काठमाडौं उपत्यका)", en: "Ghode Jatra (Kathmandu Valley)", bs: [12, 23], wd: 2, kind: "public-holiday", cat: "jatra", scope: "regional", region: "kathmandu-valley" },
  // 6.1 Days, nationwide
  { id: "labour-day", sec: "6.1(क)", ne: "विश्व मजदुर दिवस (मे १)", en: "International Labour Day (1 May)", bs: [1, 18], wd: 5, kind: "public-holiday", cat: "day", scope: "national" },
  { id: "republic-day", sec: "6.1(ख)", ne: "गणतन्त्र दिवस", en: "Republic Day", bs: [2, 15], wd: 5, kind: "public-holiday", cat: "day", scope: "national" },
  { id: "constitution-day", sec: "6.1(ग)", ne: "संविधान दिवस (राष्ट्रिय दिवस)", en: "Constitution Day (National Day)", bs: [6, 3], wd: 6, kind: "public-holiday", cat: "day", scope: "national" },
  { id: "martyrs-day", sec: "6.1(घ)", ne: "सहिद दिवस", en: "Martyrs' Day", bs: [10, 16], wd: 6, kind: "public-holiday", cat: "day", scope: "national" },
  { id: "democracy-day", sec: "6.1(ङ)", ne: "राष्ट्रिय प्रजातन्त्र दिवस", en: "National Democracy Day", bs: [11, 7], wd: 5, kind: "public-holiday", cat: "day", scope: "national" },
  { id: "womens-day", sec: "6.1(च)", ne: "अन्तर्राष्ट्रिय महिला दिवस (मार्च ८)", en: "International Women's Day (8 March)", bs: [11, 24], wd: 1, kind: "public-holiday", cat: "day", scope: "national" },
  // 6.2 Employees with disabilities only
  { id: "disability-day", sec: "6.2", ne: "अन्तर्राष्ट्रिय अपाङ्गता दिवस (डिसेम्बर ३)", en: "International Day of Persons with Disabilities (3 December)", bs: [8, 17], wd: 4, kind: "public-holiday", cat: "day", scope: "disability" },
  // 7.1 Birth anniversaries, nationwide
  { id: "buddha-jayanti", sec: "7.1(क)", ne: "बुद्ध जयन्ती", en: "Buddha Jayanti", bs: [1, 18], wd: 5, kind: "public-holiday", cat: "jayanti", scope: "national" },
  { id: "prithvi-jayanti", sec: "7.1(ख)", ne: "पृथ्वी जयन्ती (राष्ट्रिय एकता दिवस)", en: "Prithvi Jayanti (National Unity Day)", bs: [9, 27], wd: 1, kind: "public-holiday", cat: "jayanti", scope: "national" },
  // 7.2 For followers of the religion only
  { id: "falgunanda-jayanti", sec: "7.2(क)", ne: "फाल्गुनन्द जयन्ती (किराँत धर्मावलम्बी)", en: "Falgunanda Jayanti (Kirat followers)", bs: [7, 25], wd: 3, kind: "public-holiday", cat: "jayanti", scope: "community", community: { en: "Kirat followers", ne: "किराँत धर्मावलम्बी" } },
  { id: "mohammed-jayanti", sec: "7.2(ख)", ne: "मोहम्मद जयन्ती (नेपाली मुस्लिम धर्मावलम्बी)", en: "Birth of the Prophet Mohammed (Nepali Muslims)", bs: null, kind: "public-holiday", cat: "jayanti", scope: "community", community: { en: "Nepali Muslims", ne: "नेपाली मुस्लिम धर्मावलम्बी" } },
  { id: "guru-nanak-jayanti", sec: "7.2(ग)", ne: "गुरु नानक जयन्ती (नेपाली सिख धर्मावलम्बी)", en: "Guru Nanak Jayanti (Nepali Sikhs)", bs: null, kind: "public-holiday", cat: "jayanti", scope: "community", community: { en: "Nepali Sikhs", ne: "नेपाली सिख धर्मावलम्बी" } },
  // 8. Observed nationally, offices open
  { id: "untouchability-elimination-day", sec: "8(क)", ne: "जातीय भेदभाव तथा छुवाछुत उन्मूलन राष्ट्रिय दिवस", en: "National Day for the Elimination of Caste Discrimination and Untouchability", bs: [2, 21], wd: 4, kind: "observance", cat: "day", scope: "national" },
  { id: "civil-service-day", sec: "8(ख)", ne: "निजामती सेवा दिवस", en: "Civil Service Day", bs: [5, 22], wd: 1, kind: "observance", cat: "day", scope: "national" },
  { id: "genz-martyrs-day", sec: "8(ग)", ne: "जेनजी सहिद दिवस", en: "Gen Z Martyrs' Day", bs: [5, 23], wd: 2, kind: "observance", cat: "day", scope: "national" },
];

/** Section 1: the year's Saturdays as printed (month → days); used to verify the calendar. */
export const SATURDAYS_2083: Record<number, number[]> = {
  1: [5, 12, 19, 26], 2: [2, 9, 16, 23, 30], 3: [6, 13, 20, 27], 4: [2, 9, 16, 23, 30], 5: [6, 13, 20, 27], 6: [3, 10, 17, 24, 31],
  7: [7, 14, 21, 28], 8: [5, 12, 19, 26], 9: [4, 11, 18, 25], 10: [2, 9, 16, 23], 11: [1, 8, 15, 22, 29], 12: [6, 13, 20, 27],
};

export const TERAI_21 = ["Jhapa", "Morang", "Sunsari", "Saptari", "Siraha", "Udayapur", "Dhanusha", "Mahottari", "Sarlahi", "Rautahat", "Bara", "Parsa", "Nawalparasi East", "Nawalparasi West", "Rupandehi", "Kapilvastu", "Dang", "Banke", "Bardiya", "Kailali", "Kanchanpur"];

export const SOURCE_2083 = {
  id: "moha-2083",
  issuer: { en: "Ministry of Home Affairs, Government of Nepal", ne: "नेपाल सरकार, गृह मन्त्रालय" },
  gazette: "Nepal Rajpatra, Khanda 75, Sankhya 67, Bhag 5",
  publishedBS: "2082-11-18",
  url: "https://www.moha.gov.np/en/page/government-and-public-holidays-in-2083",
};
