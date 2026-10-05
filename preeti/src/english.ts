/**
 * Compact list of common English words (plus government, exam and document terms) used by convertMixed() to leave
 * real English alone inside Preeti lines. Lower case, space-separated. Words of one letter are left out on purpose:
 * single Preeti keys (k, g, t, 5 …) are common Nepali words.
 */
const WORDS = `
about above across act action activity actually add added address admin administration admission admit admitted
advance advanced after again against age agency agent ago agree agreement ahead aid air all allow allowed almost alone
along already also although always am among amount an analysis and announce announced announcement annual another
answer answers any anyone anything appear appendix applicant applicants application applications applied apply
appointed appointment approval approve approved april are area areas around arrange art article as ask asked assembly
assessment assistant associate association at attach attached attend attendance attention august authority available
average away back bachelor bad bank bar base based basic basis be became because become been before began begin
behind being believe below best better between big bill birth bit board body book both box boy branch break bring
brought budget build building business but buy by call called came campus can candidate candidates cannot capital card
care career case cases cause cell center central centre certain certificate certificates chairman chairperson chance
change changed chapter charge check chief child children choice choose circular citizen citizenship city civil claim
class classes clear clerk close closed code college come commission committee common community company complete
completed computer concerned condition conditions conduct conducted confirm consider contact content continue contract
control copy corner corporation correct cost could council count country course court cover create cross current
cut data date dated day days dead deal dear december decide decided decision degree department deputy describe design
detail details develop development did die different diploma direct direction director district division do document
documents does done door down draft due during each early east economic education effect either election else
email employee employees end engineer engineering english enough enter entrance entry environment equal even evening
event ever every everyone everything exam examination examinations examinee example except experience extension
face fact faculty fail failed family far father february federal fee fees feel few field figure file filled final
finance financial find first five floor follow following food for foreign form format former forms forward found four
free friday friend from front full fund further future gave general get girl give given go god going good got govt
government grade graded grades graduate great green ground group grow guide had half hall hand happen hard has have
having he head health hear heard held hello help her here herself high higher him himself his history hold home hope
hospital hour hours house how however human hundred idea if image important in include included including income
increase index india individual information inside institute institution instruction instructions interest
international interview into introduction is issue issued it item its itself january job join joint journal july june
just justice keep key kind knew know knowledge known land language large last late later law lead leader learn least
leave left legal less let letter level licence license life light like line list little live local long look lot love
low made main maintain major make management manager many march mark marks master math mathematics matter may maybe
me mean medical meet meeting member members memo might minister ministry minute minutes miss model monday money month
months more morning most mother move much municipality must my name national nature near need needed nepal nepali net
network never new news next night nine no non none nor north not note notes notice notification november now number
object october of off offer office officer officers official often oh old on once one online only open operation
or order ordinance organization other others our out outside over own page pages paper paragraph parent part
participate particular party pass passed past pay people per percent percentage period person personal phone physics
place plan play please point police policy political position possible post power practical pre prepare present
president press pretty previous price primary principal print private probably problem procedure process produce
product professor program programme project province provincial provide public publish published put qualification
quality question questions quite race rank rate rather read ready real really reason receive received recent record
recruitment reduce reference regarding region register registered registration regular related release released
remain remark remarks remember report representative request require required requirement research reserved resource
respect respective response rest result results return review right road roll room round rule rules run rural said
same saturday say school science score scores search seat seats second secretary section sector see seem selected
selection semester send senior sense september serial series serve service services session set seven several shall
she sheet short should show side sign signature signed simple since single sir site six size small so social society
some someone something sometimes son soon sorry sort source south space speak special staff stage stand standard start
state statement status stay step still stop story street strong student students study subject subjects submission
submit submitted such sunday supply support sure system table take taken talk tax teacher teaching team technical
technology tell ten term terms test than thank thanks that the their them themselves then theory there therefore
these they thing things think third this those though thought thousand three through thursday time timetable title to
today together told too took top total toward towards town trade training transfer travel tribhuvan true try tuesday
turn two type under understand union unit university until up update updated upon urban us use used user using usual
vacancy valid value various very via vice view village visit vote want war was watch water way we website wednesday
week well went were west what when where whether which while white who whole whom whose why wide wife will win window
with within without woman women word work worker world would write written wrong year years yes yet you young your
yours youth zone don doesn didn isn wasn aren weren won couldn wouldn shouldn haven hasn hadn pdf www http https html com org gov edu np net nos sn sl ltd pvt inc etc vs viz ie eg dr mr mrs ms
st nd rd th am pm km kg mm cm ml mb gb kb no rs nrs
academic accountant accounts ad admit agriculture amendment annex applicable architecture arts assistant audit auditor
bachelors bachelor's bs bsc ba bba bbs bed bit be bpharm biology botany calendar capacity category chemistry civil
commerce computer constitution coordinator curriculum dean diploma economics electrical electronics engineering
evaluation exam's examination examiner extension forestry geography geology gpa grading health hseb humanities
institute journalism law lecturer level licensing literature management mba mbbs mechanical medicine merit msc
neb nursing nepal's npc nrb objective optional paper pharmacy physics pharmacist plus position post psc psychology
quota rank re reexamination retotaling revised roll routine rural sample scholarship see sem semester set slc
sociology statistics supplementary symbol syllabus teacher tentative tu ugc unit vacancy viva written zoology
grade graded gradesheet marksheet result results notice notices board class date page government ministry office
officer province municipality ward district secretariat commission authority bureau council department directorate
programme scheme project budget fiscal tender bid quotation invitation procurement contract ref reference
kathmandu lalitpur bhaktapur pokhara biratnagar birgunj janakpur dharan butwal bharatpur hetauda dhangadhi nepalgunj
koshi madhesh bagmati gandaki lumbini karnali sudurpashchim
ability able absence absent absolutely academy accept acceptable accepted access accident accompany according account
accurate achieve achievement acquire actor actual adapt addition additional adequate adjust adult advantage advertise
advertisement advice advise advisor affair affect afford afraid afternoon afterwards agenda aim allocate allocation
alternative amazing analyse analyze ancient angle angry animal announce anybody anyway apart apparent appeal approach
appropriate approximately argue argument arise arm army arrival arrive artist aside aspect assess asset assign assist
assistance assume assure attack attempt attract audience author automatic autumn avoid award aware baby background
bag balance ball band basket battle beach bear beat beautiful beauty bed beginning behalf behave behaviour believe
belong benefit beside beyond bike bird black blood blue boat bonus border born borrow boss bottom bought brain brief
bright brilliant broad broken brother brown burden burn bus busy button cabinet calculate camera camp cancel cancelled
captain capture car careful carry cash cast catch category ceiling celebrate centre ceremony chain chair challenge
champion channel chapter character charity chart cheap chemical chest chief circle circumstance claim classic clean
client climate clinic clock club coach coast coffee cold collect collection colour column combination combine comfort
command comment commercial commit commitment communicate communication compare comparison compete competition complain
complaint complex component concept concern concert conclude conclusion concrete conference confidence conflict
connect connection consequence conservative considerable consist constant construct construction consult consumer
contain context contribute contribution convention conversation convert cook cool cooperation coordinate core cotton
couple courage cousin creative credit crime crisis criteria critical crop crowd culture cup currently customer cycle
daily damage dance danger dangerous dark daughter debate debt decade declare decline deep defence define definitely
definition deliver delivery demand democracy democratic demonstrate deny depend deposit depth derive desk despite
destroy determine device die diet difference difficult difficulty digital dinner disaster discipline discount discover
discuss discussion disease display distance distinct distribute distribution divide doctor dog dollar domestic double
doubt dozen drama draw dream dress drink drive driver drop drug dry duty earn earth ease easily easy eat economy edge
editor educate effective efficient effort eight elect electric electricity element eligible eligibility eliminate
emergency emphasis employ employment empty enable encourage enemy energy engage enhance enjoy ensure entire entirely
equipment error escape especially essential establish established estate estimate ethnic evaluate evidence exact
exactly examine excellent exchange exciting executive exercise exhibition exist existence expand expect expectation
expense expensive expert explain explanation explore export express expression extend extent external extra extreme
facility factor factory fair faith fall false familiar famous fan farm farmer fashion fast fat fault favour favourite
fear feature feeling female festival fight fill film finally fine finish fire firm fish fit fix flat flight flow
flower fly focus folk foot football force forest forget formal fortune foundation frame freedom frequency frequent
fresh fruit fuel function funding funny furniture gain game gap garden gas gate gather gender generally generate
generation gift glad glass global goal gold golden graduate grand grant gross growth guarantee guard guess guest gun
habit hair handle hang happy hardly harm hat hate healthy heart heat heavy height highly hill hire hit holiday hole
honour horse host hot hotel huge husband ice identify identity ignore ill illegal illness imagine immediate
immediately impact implement implementation imply import impose impossible improve improvement incident income
increasingly independent indicate industry influence inform initial initiative injury inner innovation input inquiry
insist inspection instance instead insurance intend intention internal internet invest investment investigate invite
involve involved island issue item jacket joke journey judge jump junior kid kill king kitchen knee label labour lack
lady lake largely laugh launch lay layer leaf league lean learning lecture leg leisure length lesson lie lift limit
limited link lip listen literacy loan location lock logic lose loss lost loud lovely lower luck lunch machine
magazine mail mainly majority male manage manner map marriage married mass match material maximum meal meaning
measure measurement media meeting memory mental mention menu mere message metal method middle military milk mind
minimum minor minority mission mistake mix mobile modern moment monitor mood moon moreover motor mountain mouth movement
movie multiple music mutual narrow nation native natural naturally navy nearly necessary neck negative negotiate
neighbour neither nervous newspaper nice nobody noise normal normally nose notable nothing notice novel nuclear nurse
obtain obvious obviously occasion occupation occur ocean odd offence oil okay operate opinion opportunity oppose
option orange ordinary organise organize origin original otherwise output overall owner pace pack package pain paint
pair panel parliament partly partner partnership passenger patient pattern payment peace pension perform performance
perhaps permanent permission permit physical pick picture piece pilot pink pitch plant plastic plate platform player
pleasant pleased plenty pocket poem poet poor popular population port portion positive possess possibility potential
pound poverty powerful practice praise predict prefer preference pregnant premium preparation presence presentation
preserve pressure prevent previously pride priest prime prince principle prior priority prison prisoner prize
procedure proceed production profession professional profit progress promise promote promotion proof proper property
proportion proposal propose prospect protect protection protest proud prove proved purchase pure purpose pursue
qualify quantity quarter queen quick quickly quiet rain raise random range rapid rapidly rarely ratio reach react
reaction reader reality realise realize receipt recently recognise recognize recommend recommendation recover red
reflect reform refuse regard regional regulation reject relation relationship relative relatively relax relevant
relief religion religious rely remove rent repair repeat replace reply represent republic reputation rescue reserve
resident resign resolution resolve responsibility responsible restaurant restrict restriction retain retire retirement
reveal revenue rich ride ring rise risk river rock role roof root rose rough route row royal rubber safe safety salary
sale salt sample satisfy save saving scale scene schedule scheme scientific scientist screen sea season secondary
secret secure security seek seem select sell seminar sentence separate serious seriously settle severe sex shadow shake
shape share sharp shift ship shirt shock shoe shoot shop shopping shot shoulder shout sick sight signal significant
silence silver similar simply sing sister sit situation skill skin sky sleep slightly slow slowly smile smoke snow
software soil soldier solid solution solve song soul sound speaker species specific speech speed spend spirit split
sport spread spring square stable stadium stair stake star statistic steal steel stick stock stone store storm
strange strategy stream strength stress stretch strike structure struggle stuff style success successful suddenly
suffer sufficient sugar suggest suggestion suit suitable summer sun supporter suppose surface surprise surround survey
survive suspect sweet swim symbol tail target task taste teach tear technique teeth telephone television temperature
temporary tend tension terrible territory text theatre theme thin threat throughout throw ticket tie tight till tiny
tired tomorrow tone tonight tool tooth topic touch tour tourist tourism towel tower track tradition traditional
traffic train transport treat treatment treaty tree trend trial trip trouble truck trust truth twice typical ultimately
unable uncle unemployment unfortunately unique unless unlike unlikely upper upload uploaded usually vacation valley
variable variety vehicle version victim victory video violence visible vision visitor voice volume volunteer wage wait
wake walk wall warm warn warning wash waste wave weak wealth weapon wear weather wedding weekend weight welcome
welfare wild willing wind wine wing winner winter wish witness wonder wonderful wood wooden worry worth yard yellow
yesterday
`;

/** Lower-case English words. */
export const ENGLISH = new Set(WORDS.split(/\s+/).filter((w) => w.length > 1));
