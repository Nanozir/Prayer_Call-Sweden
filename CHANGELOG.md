# Ändringslogg

Versionsnumren följer [semantisk versionering](https://semver.org/lang/sv/):
`STOR.MINDRE.FIX` – FIX för buggrättningar, MINDRE för nya funktioner, STOR för stora förändringar.

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
