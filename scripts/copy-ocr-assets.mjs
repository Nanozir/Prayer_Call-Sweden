// Copies Tesseract worker, wasm core and English language data into public/
// so OCR works fully offline inside the app.
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const out = 'public/tesseract';
mkdirSync(join(out, 'core'), { recursive: true });
mkdirSync(join(out, 'lang'), { recursive: true });

cpSync('node_modules/tesseract.js/dist/worker.min.js', join(out, 'worker.min.js'));
for (const f of readdirSync('node_modules/tesseract.js-core')) {
  if (/-lstm\.wasm\.js$/.test(f)) cpSync(join('node_modules/tesseract.js-core', f), join(out, 'core', f));
}
// Stored as .bin, not .gz: Android's build tools treat assets ending in .gz specially
// (they went missing from the APK -> HTTP 404). Content is still gzip; Tesseract detects it.
cpSync('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', join(out, 'lang', 'eng.traineddata.bin'));
console.log('OCR assets copied to', out);
