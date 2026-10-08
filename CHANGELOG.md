# Ändringslogg

Versionsnumren följer [semantisk versionering](https://semver.org/lang/sv/):
`STOR.MINDRE.FIX` – FIX för buggrättningar, MINDRE för nya funktioner, STOR för stora förändringar.

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
