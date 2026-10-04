// Common English vocabulary used to tell descriptive Title Case phrases ("Provincial Traffic
// Police Office", "Climate Resilient Future") from proper names. Not exhaustive: packfix also
// treats any word the pack or its sources use in lower case as common.
const NEWS = `
about above across action actions act add added address administration advance affairs after again against age agency agenda agreement
agriculture aid air airport alert all allow allowed along also amount analysis and annual another any appeal application approach area
areas army around arrest art as asked assembly association at attack authority authorities average award away back bad bank barrage
base basic battle be bed been before behind being best better between big bill block blocked board body bodybuilding bond border both
bridge brief bring budget build building built bureau business but by call called camp campaign can capital car care case cases cash
cause cell center centre central chair challenge champion championship championships chance change channel charge chief child children
city civil claim class clean clear climate close club coalition coast code cold collapse collective college come commerce commission
committee common community companies company complete conference congress control cooperation corporation cost council country countries
county course court cover crisis crop cross cultural culture cup current cut daily damage danger data day days deal death debate
decision defence defense deficit delay department deputy design development dialogue direct director disaster district division do
does drive drug during early earth east eastern eat eating economic economy education effect eight eighth election electricity eleven
emergency employment end energy engineering environment equal eating event events every exchange executive expert export face facility
fair fall family farm farmers federal federation fee festival field fifth fight final finance financial fire first five flight flood
floods flow food football for force foreign forest forum four fourth free from front fuel full fund funds future game games gas
general give global goal gold good government grade grand green ground group groups growth guard guide hall hand health hearing heat
heavy help high highway hill hills history home hospital hot hour house housing human hydro hydropower ice impact import in income
increase independent index industry information infrastructure inquiry institute institution insurance interest international into
investment island issue it job joint judge justice key kind labour land landslide landslides landslip landslips language large last
law leader leaders league left legal level life light line live local long low main major management market marathon match medal
media medical meeting member members men memorial middle military minister ministry mission money month more morning mountain
mountains movement much municipal municipality national natural navy near network new news next night nine ninth no north northern
not now nuclear number of office officer official officials oil old on one only open operation opposition or order organisation
organization other out over own park parliament part party pass peace people performance physique plan planning plant play
police policy political poll pollution poor port post power premier president press prevention price prices primary prime private
prize production programme program project projects protection provincial public quality race rail rain rainfall rally rapid rate
really record recovery red reform regional relief rescue research reserve resilience resilient resource resources response rice
right risk risks river road roads round rule rules rural safety sale school science sea season second secretariat security select
senior service services session seven seventh share shelter short six sixth small social society solar south southern special sport
sports spring staff stage standard state station steel step stock storm street strike student students study summit super supply
support supreme survey system talks task tax team technical technology ten tenth test the third three time top tour tourism tournament
trade traffic training transport travel treaty tribunal trust two under union unit united unity university up upper urban use valley
village visit vote war ward warning water way weather week weight welfare west western white wildlife will win winter with women
work workers working world year years young youth zone
`;

const REGIONS = `
asian african american arab australian british canadian chinese european french german indian japanese korean nepali nepalese pakistani
bangladeshi bhutanese sri lankan maldivian thai russian ukrainian western eastern northern southern central south north east west
international national provincial federal regional global continental himalayan
`;

export const COMMON = new Set([...NEWS.split(/\s+/), ...REGIONS.split(/\s+/)].filter(Boolean));

/** Function words that never decide whether a phrase is a name. */
export const STOP = new Set(
  "a an and are as at be by for from in into is of on or the to with without across over under up down off out via per than then".split(" "),
);

export function stems(w: string): string[] {
  const out = [w];
  const add = (s: string) => { if (s.length >= 3 && !out.includes(s)) out.push(s); };
  if (w.endsWith("ies")) add(w.slice(0, -3) + "y");
  if (w.endsWith("es")) add(w.slice(0, -2));
  if (w.endsWith("s")) add(w.slice(0, -1));
  if (w.endsWith("ing")) { add(w.slice(0, -3)); add(w.slice(0, -3) + "e"); }
  if (w.endsWith("ed")) { add(w.slice(0, -2)); add(w.slice(0, -1)); }
  if (w.endsWith("ly")) add(w.slice(0, -2));
  if (w.endsWith("al")) add(w.slice(0, -2));
  return out;
}
