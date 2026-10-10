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

Tips: sätt batterioptimering för appen till *Obegränsad* om notiser uteblir, och tillåt
"Alarm och påminnelser" (exakta alarm) om appen ber om det.

## iPhone

**Utan app (fungerar nu, gratis):** i Android-appen, under *Scheman*, finns knappen
**📅 Kalender** vid varje månad. Den skapar en kalenderfil (.ics) med alla bönetider och
påminnelser. Skicka den till iPhonen (Messages, WhatsApp, mejl), tryck på filen och välj
**Lägg till alla**. Tiderna hamnar i iPhonens kalender med notiser och fungerar utan internet.
Gör om det varje månad när moskén släppt nytt schema.

**Som app (kräver Apple-konto):** iOS-projektet finns i `ios/` och byggs (osignerat) av flödet
*Bygg iOS-app (kontroll)*. För att installera på en iPhone krävs
[Apple Developer Program](https://developer.apple.com/programs/) (99 USD/år). Därefter kan
appen läggas ut via TestFlight så att t.ex. en förälder installerar den med TestFlight-appen.
Begränsningar på iOS: max 64 schemalagda notiser (appen fyller på när den öppnas, så öppna
den minst en gång i veckan) och notiserna använder iPhonens standardljud.

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
3. Committa och pusha. GitHub bygger APK:n och, eftersom versionen är ny, skapar taggen
   `vX.Y.Z` och publicerar releasen med ändringsloggen. Saknas rubriken i ändringsloggen
   stoppas bygget.

Pushar utan ny version bygger och testar bara (APK finns som artefakt under Actions).

## Utveckling

```bash
npm install
npm test            # enhetstester (rättningslogik, tidszoner)
npm run test:ocr    # läser in exempelbilden i Chromium och jämför alla 186 tider
npm run sounds      # genererar om notisljuden (lågmälda klocktoner)
npm run build && npx cap sync   # öppna sedan android/ i Android Studio eller ios/ i Xcode
```

- `src/ocr/grid.js` – hittar tabellens linjer i bilden
- `src/ocr/recognize.js` – läser varje cell med Tesseract (endast siffror)
- `src/ocr/correct.js` – rättar läsfel med hjälp av att tiderna bara ändras lite per dag
- `src/notify.js` – schemalägger notiser (alltid om från början, inget blir kvar)
- Alla tider tolkas som svensk tid (Europe/Stockholm), inkl. sommartid.
