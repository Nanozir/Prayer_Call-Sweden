#!/usr/bin/env bash
# Downloads the CC0 adhan recording from Wikimedia Commons and makes the app's
# ~15 s notification sound from it: leading silence removed, 2 s fade-out,
# quiet loudness so it never blasts. Run by .github/workflows/adhan.yml.
#
# Source: https://commons.wikimedia.org/wiki/File:Beautiful_adhan.ogg
# Author: Adam-synagda (own work, 2022) — License: CC0 1.0 (public domain dedication)
set -euo pipefail

URL="https://commons.wikimedia.org/wiki/Special:FilePath/Beautiful_adhan.ogg"
UA="Salah-kalender/1.0 (https://github.com/Nanozir/Prayer_Call-Sweden)"
FFMPEG="${FFMPEG:-ffmpeg}"
tmp="$(mktemp -d)"

curl -fsSL -A "$UA" -o "$tmp/original.ogg" "$URL"
sha1="$(sha1sum "$tmp/original.ogg" | cut -d' ' -f1)"
echo "Original SHA-1: $sha1"

"$FFMPEG" -hide_banner -loglevel error -y -i "$tmp/original.ogg" -ac 1 \
  -af "silenceremove=start_periods=1:start_threshold=-40dB,atrim=0:15,asetpts=N/SR/TB,afade=t=out:st=13:d=2,loudnorm=I=-27:TP=-9:LRA=11,volume=-3dB,aresample=44100" \
  -c:a libvorbis -q:a 4 "$tmp/salah_adhan.ogg"

# Sanity check: about 15 s long and actually audible.
stats="$("$FFMPEG" -hide_banner -i "$tmp/salah_adhan.ogg" -af volumedetect -f null - 2>&1)"
echo "$stats" | grep -E "Duration|mean_volume|max_volume"
duration="$(echo "$stats" | sed -n 's/.*Duration: 00:00:\([0-9]*\).*/\1/p' | head -1)"
mean="$(echo "$stats" | sed -n 's/.*mean_volume: \(-*[0-9.]*\) dB.*/\1/p')"
[ "${duration:-0}" -ge 14 ] || { echo "Ljudet blev för kort (${duration}s)"; exit 1; }
awk -v m="$mean" 'BEGIN { exit !(m > -45) }' || { echo "Ljudet är nästan tyst (${mean} dB)"; exit 1; }

mkdir -p android/app/src/main/res/raw public/sounds assets-src
cp "$tmp/salah_adhan.ogg" android/app/src/main/res/raw/salah_adhan.ogg
cp "$tmp/salah_adhan.ogg" public/sounds/salah_adhan.ogg

cat > assets-src/ADHAN-SOURCE.md <<NOTE
# Böneutrop (notisljud)

- Källa: https://commons.wikimedia.org/wiki/File:Beautiful_adhan.ogg
- Upphovsperson: Adam-synagda (eget verk, 2022)
- Licens: CC0 1.0 Universal – fri att använda och ändra
- Originalets SHA-1: \`$sha1\`
- Bearbetning (scripts/fetch-adhan.sh): tystnad i början borttagen, första 15 s,
  2 s uttoning, låg ljudnivå (ca -30 LUFS), mono Ogg Vorbis.
NOTE
