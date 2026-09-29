// Compact, high-frequency stopword lists. Extend via options.extraStopwords.
export const ENGLISH_STOPWORDS: string[] = (
  "a an and are as at be but by for from has have he her his i in is it its of on or " +
  "that the their them they this to was were will with would you your we our us she him " +
  "not no do does did done can could should may might must shall about after all also " +
  "any because been before being between both during each few more most other over own " +
  "same so some such than then there these those through under until up very what when " +
  "where which who whom why how had having into out off down again further once here " +
  "said says say according reported reports report told tuesday monday wednesday thursday " +
  "friday saturday sunday am pm mr mrs ms dr new one two three per amid across"
).split(/\s+/);

// Common Nepali (Devanagari) function words and news filler.
export const NEPALI_STOPWORDS: string[] = (
  "र को का की मा ले हो " +
  "छ थियो थिए हुन हुन्छ " +
  "भने भनी भन्ने पनि यो " +
  "त्यो ति त्यस यस गरेको " +
  "भएको लागि तथा एवं अनी " +
  "जस्तो जस्तै होस् छन् " +
  "गर्न गर्छ गर्यो भयो " +
  "अब सबै केही आफ्नो उनी " +
  "उसले उनले माथि तल भन्दा " +
  "सम्बन्धी बाट देखि सम्म"
).split(/\s+/).filter(Boolean);
