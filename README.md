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
npm run build && npx cap sync android   # öppna sedan android/ i Android Studio
```

- `src/ocr/grid.js` – hittar tabellens linjer i bilden
- `src/ocr/recognize.js` – läser varje cell med Tesseract (endast siffror)
- `src/ocr/correct.js` – rättar läsfel med hjälp av att tiderna bara ändras lite per dag
- `src/notify.js` – schemalägger notiser (alltid om från början, inget blir kvar)
- Alla tider tolkas som svensk tid (Europe/Stockholm), inkl. sommartid.
