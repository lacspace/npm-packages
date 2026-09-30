export const EN_STOP: string[] = (
  "a an and are as at be but by for from has have he her his i in is it its of on or that the " +
  "their them they this to was were will with would you your we our us she said says say new one " +
  "two after all also any been before being over more most other into out up down again amid " +
  "government minister today yesterday report reported news"
).split(/\s+/);
export const NE_STOP: string[] = (
  "र को का की मा ले हो छ थियो हुन भने पनि यो " +
  "त्यो गरेको भएको लागि तथा छन् गर्न भयो अब " +
  "सबै आज हिजो सरकार मन्त्री समाचार भन्दा सम्बन्धी"
).split(/\s+/).filter(Boolean);
