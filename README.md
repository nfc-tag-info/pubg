# SQUAD · V1

Keturių draugų susitikimų puslapis, skirtas atidaryti telefonu iš NFC žetono.

## Kas veikia

- PUBG stiliaus laukimo vaizdas su Gintux, Obas, Vipux ir Gitoshi iš kairės į dešinę.
- Kiekvienam susitikimui atskirai saugomos READY, WAITING ir NOT CONNECTED būsenos.
- Sekundžių laikmatis, Lietuvos laikas, trumpas LOADING perėjimas, keturių draugų nuotrauka susitikimo metu.
- Sekmadienį po išvykimo pereinama į kitą susitikimą; po paskutinio – sezono pabaiga.
- Nustatymų lange keičiami nickai, atvykimas, išvykimas, vieta ir pastaba.
- Bendri duomenys per Supabase; organizatoriaus prisijungimas, duomenų validacija ir apsauga nuo vienalaikio perrašymo.
- `noindex` abiejuose HTML puslapiuose. Tai nėra slaptažodžiu apsaugotas puslapis: šaltiniai ir nuotraukos vieši.
- Senas mini žaidimas išsaugotas `legacy.html`, pataisytas laikmačio inicijavimas.

## Dabartinė būsena

**Supabase prijungtas prie PUBG projekto (`elydoynuodcpdzaufcnp`).** Schema, šeši susitikimai, keturi žaidėjai ir Realtime publikacija įdiegti. Gyvai patikrintas duomenų ir serverio laiko skaitymas bei viešų lankytojų redagavimo užraktas. Supabase saugumo patikra be pastabų.

Dar reikia sukurti organizatoriaus Auth paskyrą, suteikti jai teises ir patikrinti prisijungimą bei gyvą išsaugojimą. Iki tol šaka lieka peržiūrai; `main` ir viešas GitHub Pages puslapis nepakeisti.

Jeigu `config.js` reikšmės tuščios, įsijungia aiškiai pažymėta vietinė V1 peržiūra. Tokiu režimu pakeitimai saugomi tik toje naršyklėje. Automatiniai naršyklės testai šį režimą pasirenka patys, todėl gyvų duomenų nekeičia.

## Prijungimas

1. Pasirinkti šiam puslapiui skirtą Supabase projektą.
2. SQL Editor paleisti `supabase/schema.sql`, tada `supabase/seed.sql`. Pradiniai duomenys neperrašo jau esančio įrašo.
3. Supabase Authentication sukurti organizatoriaus vartotoją su jo pasirinktu el. paštu ir slaptažodžiu. Slaptažodis neįrašomas į šią saugyklą ir nesiunčiamas pokalbyje. Viešą registraciją galima išjungti; vien prisiregistravęs vartotojas vis tiek negauna redagavimo teisių.
4. Tik SQL Editor suteikti vartotojui organizatoriaus teises: `insert into public.squad_admins (user_id) values ('VARTOTOJO-UUID') on conflict do nothing;`.
5. Į `config.js` įrašyti projekto URL ir **publishable key** arba viešą `anon` raktą. Niekada nerašyti `service_role`, slaptažodžių ar kitų administravimo raktų.
6. Patikrinti prisijungimą ir išsaugojimą dviejuose atskiruose įrenginiuose. Būsenos platinamos per Realtime; atsarginis atnaujinimas kas 15 s, tik kol puslapis matomas. Serverio laikas sulyginamas periodiškai ir grįžus į puslapį. Tai sekundžių rodymas, ne garantuotas laikrodžių sutapimas per prastą ryšį.
7. Tik užbaigus prijungimą sujungti V1 šaką su `main`. Esamas GitHub Pages adresas ir NFC žetonai gali likti tie patys.

Supabase RLS leidžia viešai skaityti komandos duomenis, bet rašyti tik į `squad_admins` įtrauktiems naudotojams. Teisių lentelės iš naršyklės papildyti negalima. Neprisijungę ir paprasti prisijungę naudotojai rašyti negali. Iki ryšio patvirtinimo realus išsaugojimas išjungtas. Ryšiui nutrūkus rodomi paskutiniai gauti duomenys su aiškiu įspėjimu.

## Darbas vietoje

Reikia Node.js 22 ar naujesnio.

```sh
npm ci
npm run build
npm test
npm run test:database
npm run serve
```

Peržiūra: `http://127.0.0.1:4173`. Naršyklės testams atskirame terminale: `npm run test:browser`. Pagal nutylėjimą naudojamas įdiegtas Microsoft Edge; kitam Playwright kanalui nustatykite `BROWSER_CHANNEL`. Testų vaizdai saugomi ignoruojamame `.qa/` aplanke.

Naršyklės testai tikrina 320, 390, 430 ir 1440 px ekranus, nustatymus, validaciją, saugų teksto rodymą, laiko ribas ir seną mini žaidimą. Sinchronizavimo naršyklės testas naudoja imituotą Supabase API; atskiras PGlite testas tikrina SQL ir RLS realiame PostgreSQL variklyje. Tai nepakeičia gyvo prijungto Supabase projekto patikrinimo.

`npm run test:live` atlieka tik skaitymo patikrą su `config.js` nurodytu gyvu projektu. Tikrina duomenis, laiką, organizatorių lentelės apsaugą ir mobiliojo puslapio prisijungimą prie duomenų bazės; duomenų nekeičia.

`assets/app.js` yra sukompiliuotas `src/app.mjs` ir priklausomybių rezultatas. Pakeitus šaltinius paleisti `npm run build` ir įkelti atnaujintą failą. GitHub Pages papildomo serverio ar npm paleidimo nereikia.

## Vaizdai

`assets/lobby.webp` paruoštas integruotu ImageGen įrankiu pagal vartotojo pateiktą laukimo vaizdą. Galutinė užklausa: pašalinti viršuje ir apačioje nupieštą SQUAD tekstą, Erangel žemėlapio kortelę, READY mygtuką, laikmačio eilutę ir nustatymų navigaciją; natūraliai pratęsti lėktuvo interjerą ir grindis; išsaugoti keturių veikėjų pozas, padėtis, aprangą, apšvietimą ir vertikalią kompoziciją; nepridėti naujų užrašų. Šiuos valdymo elementus piešia HTML.

`assets/squad.webp` – vartotojo pateikta keturių draugų nuotrauka, tik pakeistas formatas į WebP. Originalai liko nepakeisti. Abu galutiniai vaizdai saugomi šiame projekto aplanke.

## Vėlesnės versijos

Sezono datos ir nickai nėra susieti su paveikslėlyje įrašytu tekstu. V2 galima pridėti asmeninius prisijungimus ir leidimą draugui keisti tik savo dalyvavimą. V1 visą ketvertą valdo organizatorius.
