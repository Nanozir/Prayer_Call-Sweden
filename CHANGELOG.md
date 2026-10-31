# Ändringslogg

Versionsnumren följer [semantisk versionering](https://semver.org/lang/sv/):
`STOR.MINDRE.FIX` – FIX för buggrättningar, MINDRE för nya funktioner, STOR för stora förändringar.

## [1.10.0] – 2026-10-31

### Nytt
- **Windows-app:** samma app som skrivbordsprogram för Windows (installerare och portabel `.exe` under
  *Releases*). Ligger kvar i systemfältet, skickar bönenotiser och påminnelser även när fönstret är stängt,
  och alarmen öppnas i ett fönster överst med *Stäng av* och *Snooza 5 min*. *Starta med Windows* ställs in
  under *Inställningar*. Programmet är inte kodsignerat, så Windows kan varna första gången.
- **Bred skärm:** på datorskärmar används ett sidofält i stället för flikraden längst ned, månadsvyn och
  moskétavlan använder bredden och ←/→ byter dag (på *Idag*) eller månad (i månadsvyn).

## [1.9.1] – 2026-10-31

### Fixat
- **Alarmet gick inte att stänga av.** Nu öppnas alarmskärmen med stora knapparna *Stäng av* och
  *Snooza 5 min* direkt när alarmet ringer (om appen är öppen) och när du öppnar appen medan det ringer.
  Notisen visas direkt i stället för efter ca 10 sekunder, och att svepa bort den stänger av alarmet.

## [1.9.0] – 2026-10-29

### Nytt
- **Alarm per bön:** slå på ett riktigt alarm för valfri bön (t.ex. Fajr) under *Inställningar → Alarm*, vid
  bönetiden eller 5–30 min innan. Alarmet följer schemat automatiskt varje dag, ringer med böneutrop tills
  det stängs av (eller i högst 5 min), kan snoozas 5 min och visas över låsskärmen. Android ber om
  "Alarm och påminnelser" och (Android 14+) "Fullskärmsnotiser". På iPhone blir alarmet en notis med ljud.
- **Flera påminnelser per bön:** välj valfria tider innan varje bön (5, 10, 15, 20, 30, 45 eller 60 min),
  t.ex. Dhohr om 10 och 5 min. "Samma för alla" kopierar valet. Tidigare inställning flyttas över automatiskt.
- **Månadsvy:** hela månadens bönetider i en tabell (dagens rad markerad, fredagar tonade, passerade dagar
  nedtonade). Öppnas via *Månadsvy* på Idag eller vid varje månad under *Scheman*. Tryck på en dag för att
  hoppa dit.

## [1.8.0] – 2026-10-23

### Nytt
- **PDF-scheman:** under *Scheman* kan nu även PDF-filer väljas, t.ex. från islam.nu. PDF:er med
  text läses exakt (inga läsfel att granska); skannade PDF:er läses som en bild. Allt sker offline.
  Tider från islam.nu märks tydligt, eftersom de skiljer sig några minuter från Karlstads moskés
  eget schema (t.ex. Maghrib oftast 3–4 min tidigare).
- **Moskétavla:** ny visning på *Idag* som liknar skärmen i moskén – stor klocka med sekunder,
  datum och hijri, Shuruk, Jumua och de fem bönerna med iqamah-tider. Nästa bön lyses upp och
  mellan böneutrop och iqamah räknas det ner till iqamah. Iqamah-minuter och Jumua-tid ställs in
  under *Inställningar*.

## [1.7.0] – 2026-10-16

### Nytt
- **Säkerhetskopia** under Inställningar: exportera alla scheman och inställningar till en fil och
  importera dem igen, t.ex. på en ny telefon eller när du byter till Google Play-versionen.
- **Google Play:** varje release innehåller nu även en `.aab`-fil för Google Play, och
  `docs/google-play/` har en steg-för-steg-guide för internt test (familjen), butikstexter,
  integritetspolicy, ikon och omslagsbild.

## [1.6.0] – 2026-10-16

### Nytt
- **Bättre bildinläsning:** adaptiv binarisering (Sauvola) per cell, automatisk hantering av
  skärmdumpar i mörkt läge, och osäkra celler läses en gång till med annan bildbehandling.
  Kontrollen mot grannarnas tider är skärpt (1,5 min i stället för 4), så även små läsfel
  markeras i stället för att smita igenom. Testat på försämrade bilder: skugga 183 → 0 fel,
  oskärpa 85 → 0, mörkt läge 186 → 0, låg upplösning 67 → 37 (alla markerade).
- **"Fungerar notiserna?"** under Inställningar: kollar notistillstånd, exakta alarm,
  batterioptimering och hur många notiser som är inlagda (iPhone: X av 64), med knappar direkt
  till rätt inställning.
- **Widget för hemskärmen (Android):** nästa bön med nedräkning. Håll fingret på hemskärmen →
  Widgetar → Salah-kalender.
- **Qibla-kompass** (ny flik): 142° (sydost) från Karlstad, ingen platsbehörighet behövs.
- **Hijri-datum** under dagens datum, med ⓘ-förklaring och justering ±2 dagar för månsyn.
- **Mjukare dags-/månadsbyten** med View Transitions (med reservanimation på äldre telefoner).

### Förbättrat
- Systemets egna kontroller (tidsväljare, listor, kryssrutor) följer mörkt läge.
- Skärmläsare: räknaren för gula/röda tider, inläsningsförloppet och fel läses upp; varje tid i
  granskningen har en beskrivande etikett.
- Uppdaterade GitHub Actions och vite. Gradle 9 hoppas över tills vidare (fungerar inte med
  Androids byggplugin 8.x).

### Rättat
- Kalenderexport: semikolon i texter escapas korrekt (från den dagliga kontrollen, PR #14).
- "Till och med"-datumet för notiser räknade med schemapåminnelsen.
- Manuell inmatning sa felaktigt "kunde inte läsa tiden".

## [1.5.0] – 2026-10-10

### Nytt
- **Bläddra mellan dagar på "Idag":** svep åt vänster/höger (eller tryck på pilarna) för att se
  nästa/föregående dags bönetider. "Till idag" tar dig tillbaka.
- Vid månadsskifte syns en tydligare animation med månadens namn, så man märker att man bytt
  månad. Finns inget schema för nästa (eller förra) månad visas "Inget schema för …" med en
  knapp för att lägga till det – längre än så går det inte att svepa.

## [1.4.0] – 2026-10-10

### Nytt
- **Ändra tider enkelt:** tryck på en tid i granskningen så öppnas en ruta med tidsväljare, vad
  appen läste, dagen före/efter och knappen "Stämmer – spara". En räknare visar hur många gula
  och röda tider som är kvar och "Gå till nästa" hoppar direkt till nästa. Sparade scheman kan
  också ändras ("Visa / ändra").
- **Beräknade tider (nödläge)** under Inställningar, med förklaring bakom ⓘ-knappen. När moskéns
  schema saknas räknas tiderna fram från solens läge över Karlstad, kalibrerat mot moskéns egna
  scheman (eller samma månad förra året om den finns). Tydligt märkta "beräknad" i appen och
  notiserna; moskéns schema går alltid före.
- **Kalenderexport (.ics) för iPhone och andra telefoner:** "📅 Kalender" vid varje schema delar
  en fil som lägger in alla bönetider med påminnelser i telefonens kalender – ingen app behövs.
- **iOS-version förberedd** (Capacitor iOS-projekt, byggkontroll på macOS i GitHub Actions).
  Att installera på iPhone kräver ett Apple-utvecklarkonto, se README.

### Rättat
- En skärmdump från testet hade av misstag hamnat i repot.

### Övrigt
- Allt fungerar utan internet: textigenkänning, beräkning, notiser och kalenderexport.
- På iPhone läggs bara de närmaste dagarnas notiser in åt gången (iOS max 64).

## [1.3.0] – 2026-10-08

### Nytt
- **Böneutrop som notisljud** (ca 15 s, lågmält, med mjuk uttoning). Välj det under
  Inställningar → "Ljud vid bönetiden". Inspelningen kommer från Wikimedia Commons och är
  CC0 (fri att använda) – se `assets-src/ADHAN-SOURCE.md`.

## [1.2.0] – 2026-10-08

### Nytt
- **Notis vid själva bönetiden kommer alltid.** Väljer man en extra påminnelse (t.ex. 10 min
  innan) kommer den som en egen notis märkt "Påminnelse: … om 10 min – inte bönetid än", och
  sedan en separat notis "Det är dags för …" när tiden är inne.
- **Ljud för notiser:** välj klockspel (ca 5 s), kort ljud (ca 2 s) eller inget ljud (bara
  vibration). Påminnelser innan bön har alltid det korta ljudet. Ljuden är lågmälda från
  början och kan provlyssnas under Inställningar. Testnotisen använder valt ljud.

### Ändrat
- "till och med"-datumet på startsidan räknar bara bönenotiser, inte schemapåminnelser.

## [1.1.2] – 2026-10-08

### Rättat
- "Kunde inte läsa lang/eng.traineddata.gz (HTTP 404)": språkdatan för textigenkänningen
  försvann ur Android-appen eftersom Androids byggverktyg hanterar filer som slutar på `.gz`
  speciellt. Filen heter nu `.bin`, och bygget kontrollerar att alla OCR-filer finns i APK:n.

## [1.1.1] – 2026-10-08

### Säkerhet
- Strikt innehållspolicy (CSP): appen kan bara köra sina egna inbyggda filer – inga externa
  skript, ramar eller nätverksanrop.
- Okrypterad trafik (http) är avstängd och felsökning av appens webbvy är avstängd.
- Signeringsnyckeln kan hämtas från GitHub Secrets i stället för repot.
- Varje bygge kontrollerar beroenden mot kända säkerhetshål (`npm audit`), och Dependabot
  föreslår säkerhetsuppdateringar varje vecka.
- Releaser innehåller SHA-256-kontrollsumma och signeringscertifikatets fingeravtryck.

## [1.1.0] – 2026-10-08

### Rättat
- Inläsning av bild fastnade på "Startar textigenkänning…" i Android-appen. Textigenkänningens
  bakgrundstråd hämtar inte längre egna filer (det kan hänga sig i Android); allt laddas i förväg.
- Om textigenkänningen ändå inte startar visas ett tydligt felmeddelande efter 2 minuter i stället
  för att appen står still.

### Nytt
- Nytt utseende: stort kort för nästa bön med nedräkning och förloppsindikator.
- Tryck på klockan vid en bön för att slå av/på just den notisen.
- Ny flik "Scheman" med inläsning och alla inlagda scheman samlade.
- Förloppsvisning med miniatyrbild och procent under inläsning.
- Versionsnumret visas under Inställningar.

### Versionshantering
- Ett versionsnummer (i `package.json`) styr appen, Android-versionen och GitHub-releasen.
- En release (`v1.1.0` osv.) skapas automatiskt när versionen höjs, med APK och ändringslogg.

## [1.0.0] – 2026-10-08

- Första versionen: läser in moskéns månadsschema från en bild, granskning av tider,
  notiser för varje bön, varningar för utgångna scheman.
