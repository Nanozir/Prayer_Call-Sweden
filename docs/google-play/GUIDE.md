# Salah-kalender på Google Play – internt test (för familjen)

**Internt test** passar för familj och nära vänner: upp till 100 personer, ingen granskningskö
att tala om, automatiska uppdateringar och inga varningar om "okänd app". Kravet på 12 testare
i 14 dagar och formuläret om datasäkerhet gäller **inte** internt test (de gäller först om
appen ska ut till fler).

## 1. Skapa utvecklarkontot (en gång, 25 USD)

1. Gå till <https://play.google.com/console/signup> och logga in med ditt Google-konto.
2. Välj **Personligt konto**, betala 25 USD och genomför identitetskontrollen
   (legitimation; det kan ta några dagar innan den är klar).

## 2. Skapa appen

1. Play Console → **Skapa app**.
2. Appnamn: `Salah-kalender` · Standardspråk: `svenska` · **App** · **Kostnadsfri**.
3. Kryssa i deklarationerna och klicka **Skapa app**.

## 3. Ladda upp appen till internt test

1. Ladda ner `Salah-kalender-vX.Y.Z-google-play.aab` från senaste release på GitHub
   (Releases). Det är samma app som APK:n, men i formatet Google Play kräver.
2. Play Console → **Testa och släpp → Testning → Internt test → Skapa ny version**.
3. När du får frågan om **appsignering**: välj att **Google skapar och hanterar
   signeringsnyckeln** (rekommenderat). Ladda sedan upp `.aab`-filen.
4. Versionsnamn fylls i automatiskt. Under "Versionsinformation" kan du klistra in texten för
   versionen från `CHANGELOG.md`.
5. **Spara → Granska version → Börja distribuera till internt test.**

## 4. Lägg till familjen

1. **Internt test → Testare → Skapa e-postlista**, t.ex. "Familjen", och lägg till deras
   Gmail-adresser (det konto de använder i Play Butik på telefonen).
2. Kopiera **länken för att gå med** och skicka den till dem.
3. De öppnar länken på telefonen → **Bli testare** → **ladda ner från Google Play**.

## 5. Flytta över från GitHub-versionen (viktigt)

Play-versionen signeras av Google med en annan nyckel än APK:n från GitHub, så Android ser
dem som olika appar och vill inte installera den ena ovanpå den andra:

1. I den gamla appen: **Inställningar → Säkerhetskopia → Exportera** och spara filen
   (t.ex. i Google Drive eller skicka den till dig själv).
2. Avinstallera den gamla appen.
3. Installera från Google Play (steg 4).
4. I nya appen: **Inställningar → Säkerhetskopia → Importera** och välj filen.
5. Kör **Inställningar → Fungerar notiserna?** och tryck på knapparna där något är ⚠️.

## 6. Nya versioner

När en ny version släpps på GitHub: ladda upp den nya `.aab`-filen under **Internt test →
Skapa ny version**. Familjens telefoner uppdateras sedan automatiskt via Play Butik.

## Om Play Console frågar om mer

Play Console visar ibland en lista under **Policy → Appinnehåll**. Svar som stämmer för appen:

| Fråga | Svar |
|---|---|
| Integritetspolicy | Texten finns i `INTEGRITETSPOLICY.md`. Play vill ha en offentlig länk – enklast: klistra in texten i ett Google-dokument → **Arkiv → Dela → Publicera på webben** och använd den länken. |
| Annonser | Nej, appen innehåller inga annonser. |
| Appåtkomst | Alla funktioner är tillgängliga utan inloggning eller särskild åtkomst. |
| Innehållsklassificering | Fyll i frågeformuläret: kategori "Verktyg/Referens", inget våld, ingen användargenererad delning, inga köp. |
| Målgrupp | 13 år och äldre (välj inte barn under 13 – då gäller extra regler för familjeappar). |
| Datasäkerhet | Behövs inte för internt test. Om det efterfrågas: appen samlar inte in och delar inte någon data. |
| Exakta alarm | Appen använder `SCHEDULE_EXACT_ALARM` för att bönenotisen ska komma på minuten; användaren slår på det själv i inställningarna. Motivering: se `BUTIKSTEXTER.md`. |

Text i butiken (namn, beskrivningar), ikon (`ikon-512.png`) och omslagsbild
(`omslagsbild-1024x500.png`) finns här i mappen om Play Console ber om dem.
