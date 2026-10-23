# Salah-kalender

Android-app som gör Karlstads moskés månadsscheman för bönetider till notiser.

1. Ta en bild/skärmdump av moskéns schema och välj den i appen (**Lägg till schema**).
2. Appen läser av tabellen på telefonen (offline, ingen data skickas någonstans), rättar
   typiska läsfel automatiskt och visar resultatet för granskning:
   - **gul** ruta = automatiskt rättad, titta snabbt
   - **röd** ruta = osäker, kontrollera mot bilden (måste tryckas på innan man kan spara)
3. Spara – notiser schemaläggs för varje bön (Shuruk är avstängt som standard).

## Gamla och utgångna scheman

- Ett schema för en månad som redan passerat kan läsas in och sparas, men appen säger att
  det är utdaterat och skapar inga notiser från det.
- Notiser skapas bara för datum som täcks av ett inlagt schema. När det sista schemat tar
  slut skickas inga bönenotiser (så du aldrig får fel tider). Istället:
  - 3 dagar innan: påminnelse om att lägga in nästa månad
  - den 1:a i nya månaden: notis om att schemat har gått ut
  - startsidan visar en tydlig varning

## Installera

Ladda ner senaste `Salah-kalender-vX.Y.Z.apk` under **Releases** på telefonen och öppna den
(tillåt "installera okända appar"). Nya versioner installeras ovanpå den gamla, inlagda
scheman behålls. Vad som ändrats står i [CHANGELOG.md](CHANGELOG.md).

**Google Play (familjen):** se [docs/google-play/GUIDE.md](docs/google-play/GUIDE.md) – internt
test för upp till 100 personer, med automatiska uppdateringar. Varje release innehåller även
`Salah-kalender-vX.Y.Z-google-play.aab` för uppladdning.

Tips: sätt batterioptimering för appen till *Obegränsad* om notiser uteblir, och tillåt
"Alarm och påminnelser" (exakta alarm) om appen ber om det.

## Funktioner i korthet

- **Idag:** nästa bön med nedräkning, hijri-datum, svep mellan dagar. Kan visas som lista eller
  som **moskétavla** (stor klocka, iqamah-tider, Jumua – ställs in under Inställningar).
- **Scheman:** läs in schemat från en bild eller PDF (t.ex. islam.nu), granska/ändra tider,
  kalenderexport. Obs: islam.nu räknar fram egna tider som skiljer sig några minuter från
  moskéns schema (Maghrib oftast 3–4 min tidigare) – appen varnar för det.
- **Qibla:** kompass mot Mecka (142° från Karlstad), utan platsbehörighet.
- **Inställningar:** notiser och ljud, "Fungerar notiserna?"-kontroll, beräknade tider (nödläge),
  justering av hijri-datum.
- **Widget (Android):** nästa bön med nedräkning på hemskärmen.

## iPhone

En iPhone kan inte installera appfiler direkt från nätet som Android kan – Apple kräver att
varje app är signerad för telefonen. Det finns tre vägar:

**1. Appen från GitHub via SideStore/AltStore (gratis).** Varje release innehåller även
`Salah-kalender-vX.Y.Z.ipa` (iPhone-versionen, osignerad). Den installeras med
[SideStore](https://sidestore.io) eller [AltStore](https://altstore.io), som signerar appen med
ett eget, gratis Apple-ID:
1. Installera SideStore eller AltStore på iPhonen (första gången behövs en dator, Windows eller
   Mac – följ guiden på deras webbplats).
2. Ladda ner `.ipa`-filen från Releases på iPhonen och öppna den med SideStore/AltStore.
3. Godkänn utvecklaren under *Inställningar → Allmänt → VPN och enhetshantering*.

Begränsningar med gratis Apple-ID: appen måste förnyas var 7:e dag (SideStore/AltStore gör det
automatiskt i bakgrunden, men telefonen måste ibland vara på Wi-Fi), högst 3 sådana appar.
Inlagda scheman finns kvar vid förnyelse och uppdatering.

**2. Utan app – kalenderfil (gratis, enklast).** I appen under *Scheman* finns **📅 Kalender**
vid varje månad. Skicka filen till iPhonen, öppna den och välj **Lägg till alla** – tiderna hamnar
i kalendern med påminnelser. Görs om varje månad.

**3. TestFlight (99 USD/år).** Med [Apple Developer Program](https://developer.apple.com/programs/)
kan appen delas via TestFlight utan 7-dagarsgränsen.

Gäller alla iPhone-varianter av appen: max 64 schemalagda notiser (appen fyller på när den
öppnas – öppna den minst en gång i veckan) och notiserna använder iPhonens standardljud.

## Beräknade tider (nödläge)

Kan slås på under Inställningar. Saknas moskéns schema för innevarande eller nästa månad räknas
tiderna fram (`src/estimate.js`): solens läge över Karlstad (NOAA-formler) med skymnings-/
gryningsvinklar, Asr-skuggfaktor och minutjusteringar som anpassas så att de återger moskéns
egna inlagda scheman (annars `src/data/karlstad-reference.json`). Finns samma månad från ett
tidigare år används den, justerad för sommartid. Mot moskéns oktober 2026 är medelfelet under
en minut; Fajr/Isha på sommaren är osäkrast.

## Säkerhet och integritet

- **Ingen data lämnar telefonen.** Bilder läses av lokalt, scheman och inställningar sparas
  bara i appen. Ingen inloggning, reklam, analys eller spårning.
- **Behörigheter:** notiser, exakta alarm (för att notisen ska komma på minuten), start efter
  omstart (för att återställa notiser) och INTERNET (krävs tekniskt av Androids webbvy – appen
  anropar ingen server; en innehållspolicy blockerar alla externa anrop).
- **Spårbara byggen:** varje APK byggs öppet i GitHub Actions från koden i repot, och
  releasen anger APK:ns SHA-256 och signeringscertifikatets fingeravtryck.

### Play Protect

Appar som installeras utanför Play Butik kan få en varning ("okänd app") oavsett innehåll,
eftersom Google inte känner till utvecklaren. Det går inte att stänga av inifrån appen –
skanna gärna appen när Play Protect frågar. Helt utan varning blir det först om appen
publiceras på Play Butik eller signeras av en Google-verifierad utvecklare.

### Egen signeringsnyckel (rekommenderas)

Byggen signeras med en reservnyckel som ligger i repot. För en hemlig nyckel:

1. `keytool -genkeypair -keystore release.keystore -alias salah -keyalg RSA -keysize 4096 -validity 10000`
2. Lägg till under *Settings → Secrets and variables → Actions*:
   `SIGNING_KEYSTORE_BASE64` (`base64 -w0 release.keystore`), `SIGNING_STORE_PASSWORD`,
   `SIGNING_KEY_ALIAS` (`salah`) och `SIGNING_KEY_PASSWORD`.
3. Avinstallera appen en gång och installera nästa release (ny nyckel = ny app för Android;
   inlagda scheman behöver läggas in igen). Spara nyckeln säkert – utan den kan appen inte
   uppdateras.

## Ljud

- Klockspel och kort ljud genereras av `scripts/make-sounds.mjs`.
- Böneutropet kommer från [Beautiful adhan.ogg](https://commons.wikimedia.org/wiki/File:Beautiful_adhan.ogg)
  (Adam-synagda, CC0) och kortas/sänks av `scripts/fetch-adhan.sh` via flödet
  *Hämta böneutrop* – detaljer i `assets-src/ADHAN-SOURCE.md`.

## Versioner och releaser

Versionsnumret finns på ett ställe: `version` i `package.json`. Därifrån hämtar appen
(visas under Inställningar) och Android-bygget (`versionName`, och `versionCode` =
STOR·10000 + MINDRE·100 + FIX) sitt nummer.

Så släpps en ny version:

1. Höj `version` i `package.json` (`npm version patch|minor|major --no-git-tag-version`:
   patch = buggfix, minor = ny funktion, major = stor förändring).
2. Skriv vad som ändrats under en ny rubrik `## [X.Y.Z]` i `CHANGELOG.md`.
3. Committa, pusha och slå ihop till `main`. När versionen är ny på `main` skapar GitHub
   taggen `vX.Y.Z` och publicerar releasen med ändringsloggen. Saknas rubriken i
   ändringsloggen stoppas bygget.

Andra grenar och pushar utan ny version bygger och testar bara (APK finns som artefakt
under Actions).

## Daglig felkontroll

En schemalagd Claude-rutin ("Salah-kalender: daglig felkontroll", varje morgon 06:47) går
igenom koden, kör alla tester och letar efter buggar och säkerhetsbrister. Hittar den något
öppnar den en PR (`daily-check/ÅÅÅÅ-MM-DD`) – den slår aldrig ihop själv. Rutinen hanteras
under Routines på claude.ai.

## Utveckling

```bash
npm install
npm test            # enhetstester (rättningslogik, tidszoner)
npm run test:ocr    # läser in exempelbilden i Chromium och jämför alla 186 tider
npm run test:ocr-bench   # försämrade bilder (skugga, låg upplösning, mörkt läge, oskärpa);
                         # misslyckas om något fel inte markeras gult/rött
npm run test:pdf    # islam.nu-PDF (exakt), skannad PDF (OCR) och moskétavlan
npm run test:native # kör appen som "Android"/"iPhone" (simulerad native-del): notiser,
                    # notiskontrollen, widgetdata, kiblakompassen
npm run sounds      # genererar om notisljuden (lågmälda klocktoner)
npm run build && npx cap sync   # öppna sedan android/ i Android Studio eller ios/ i Xcode
```

- `src/ocr/grid.js` – hittar tabellens linjer i bilden
- `src/ocr/recognize.js` – läser varje cell med Tesseract (endast siffror)
- `src/ocr/correct.js` – rättar läsfel med hjälp av att tiderna bara ändras lite per dag
- `src/ocr/binarize.js` – bildförbehandling (Sauvola, kontrast, mörkt läge)
- `src/pdf.js`, `src/schedule-text.js` – PDF-import (pdf.js, offline) och tolkning av tabelltext
- `src/board.js` – moskétavlan
- `src/notify.js` – schemalägger notiser (alltid om från början, inget blir kvar) och widgetdata
- `src/health.js` – "Fungerar notiserna?"-listan
- `src/qibla.js`, `src/hijri.js`, `src/daynav.js`, `src/estimate.js`, `src/ics.js`
- `android/app/src/main/java/se/salahkalender/app/` – egen native-kod: batteristatus,
  inställningsgenvägar (`SalahNativePlugin`) och widgeten (`NextPrayerWidget`)
- Alla tider tolkas som svensk tid (Europe/Stockholm), inkl. sommartid.
