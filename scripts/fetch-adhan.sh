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
tmp="$(mktemp -d)"

curl -fsSL -A "$UA" -o "$tmp/original.ogg" "$URL"
sha1="$(sha1sum "$tmp/original.ogg" | cut -d' ' -f1)"
echo "Original SHA-1: $sha1"

ffmpeg -hide_banner -loglevel error -y -i "$tmp/original.ogg" -ac 1 -ar 44100 \
  -af "silenceremove=start_periods=1:start_threshold=-40dB,atrim=0:15,asetpts=N/SR/TB,afade=t=out:st=13:d=2,loudnorm=I=-26:TP=-12:LRA=11" \
  -c:a libvorbis -q:a 4 "$tmp/salah_adhan.ogg"

mkdir -p android/app/src/main/res/raw public/sounds
cp "$tmp/salah_adhan.ogg" android/app/src/main/res/raw/salah_adhan.ogg
cp "$tmp/salah_adhan.ogg" public/sounds/salah_adhan.ogg

cat > assets-src/ADHAN-SOURCE.md <<NOTE
# Böneutrop (notisljud)

- Källa: https://commons.wikimedia.org/wiki/File:Beautiful_adhan.ogg
- Upphovsperson: Adam-synagda (eget verk, 2022)
- Licens: CC0 1.0 Universal – fri att använda och ändra
- Originalets SHA-1: \`$sha1\`
- Bearbetning (scripts/fetch-adhan.sh): tystnad i början borttagen, första 15 s,
  2 s uttoning, låg ljudnivå (-26 LUFS, topp -12 dB), mono Ogg Vorbis.
NOTE
ffprobe -hide_banner -show_entries format=duration -of csv=p=0 public/sounds/salah_adhan.ogg
