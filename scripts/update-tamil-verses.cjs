/* ═══════════════════════════════════════════════════════════════
   update-tamil-verses.cjs
   Fetches Tamil Union Version from aruljohn/Bible-tamil (GitHub CDN)
   and updates the verse_text_tamil / verse_text_tamil_reference fields
   in create-bible-verses.cjs, then triggers a fresh Excel export.

   Run:  node scripts/update-tamil-verses.cjs
   ═══════════════════════════════════════════════════════════════ */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const BASE_URL = 'https://cdn.jsdelivr.net/gh/aruljohn/Bible-tamil/';

// Maps the English book name used in our verse_reference strings
// to the exact filename used by the aruljohn/Bible-tamil CDN repo.
const BOOK_FILE_MAP = {
  'Genesis':          'Genesis',
  'Exodus':           'Exodus',
  'Leviticus':        'Leviticus',
  'Numbers':          'Numbers',
  'Deuteronomy':      'Deuteronomy',
  'Joshua':           'Joshua',
  'Ruth':             'Ruth',
  '1 Samuel':         '1 Samuel',
  '2 Samuel':         '2 Samuel',
  '1 Kings':          '1 Kings',
  '2 Kings':          '2 Kings',
  '1 Chronicles':     '1 Chronicles',
  '2 Chronicles':     '2 Chronicles',
  'Ezra':             'Ezra',
  'Nehemiah':         'Nehemiah',
  'Esther':           'Esther',
  'Job':              'Job',
  'Psalm':            'Psalms',
  'Psalms':           'Psalms',
  'Proverbs':         'Proverbs',
  'Ecclesiastes':     'Ecclesiastes',
  'Song of Solomon':  'Song of Songs',
  'Song of Songs':    'Song of Songs',
  'Isaiah':           'Isaiah',
  'Jeremiah':         'Jeremiah',
  'Lamentations':     'Lamentations',
  'Ezekiel':          'Ezekiel',
  'Daniel':           'Daniel',
  'Hosea':            'Hosea',
  'Joel':             'Joel',
  'Amos':             'Amos',
  'Obadiah':          'Obadiah',
  'Jonah':            'Jonah',
  'Micah':            'Micah',
  'Nahum':            'Nahum',
  'Habakkuk':         'Habakkuk',
  'Zephaniah':        'Zephaniah',
  'Haggai':           'Haggai',
  'Zechariah':        'Zechariah',
  'Malachi':          'Malachi',
  'Matthew':          'Matthew',
  'Mark':             'Mark',
  'Luke':             'Luke',
  'John':             'John',
  'Acts':             'Acts',
  'Romans':           'Romans',
  '1 Corinthians':    '1 Corinthians',
  '2 Corinthians':    '2 Corinthians',
  'Galatians':        'Galatians',
  'Ephesians':        'Ephesians',
  'Philippians':      'Philippians',
  'Colossians':       'Colossians',
  '1 Thessalonians':  '1 Thessalonians',
  '2 Thessalonians':  '2 Thessalonians',
  '1 Timothy':        '1 Timothy',
  '2 Timothy':        '2 Timothy',
  'Titus':            'Titus',
  'Philemon':         'Philemon',
  'Hebrews':          'Hebrews',
  'James':            'James',
  '1 Peter':          '1 Peter',
  '2 Peter':          '2 Peter',
  '1 John':           '1 John',
  '2 John':           '2 John',
  '3 John':           '3 John',
  'Jude':             'Jude',
  'Revelation':       'Revelation',
};

// In-memory cache: fileName → parsed book JSON
const bookCache = {};

function fetchBookData(fileName) {
  if (bookCache[fileName]) return Promise.resolve(bookCache[fileName]);

  const url = BASE_URL + encodeURIComponent(fileName) + '.json';
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'node' } }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          bookCache[fileName] = data;
          resolve(data);
        } catch {
          console.warn(`  ⚠️  Could not parse JSON for "${fileName}"`);
          bookCache[fileName] = null;
          resolve(null);
        }
      });
    }).on('error', err => {
      console.warn(`  ⚠️  Network error fetching "${fileName}": ${err.message}`);
      bookCache[fileName] = null;
      resolve(null);
    });
  });
}

// Handles:  "Psalm 23:1"  "1 Corinthians 13:4-5"  "Song of Solomon 3:4"
//           "Hebrews 13:5b"  "Joshua 24:15b"  "Nehemiah 8:10b"
function parseVerseReference(ref) {
  const clean = ref.replace(/[ab]$/, '');
  const m = clean.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  return {
    bookName:   m[1].trim(),
    chapter:    parseInt(m[2], 10),
    verseStart: parseInt(m[3], 10),
    verseEnd:   m[4] ? parseInt(m[4], 10) : parseInt(m[3], 10),
  };
}

async function getTamilData(bookName, chapter, verseStart, verseEnd) {
  const fileName = BOOK_FILE_MAP[bookName];
  if (!fileName) {
    console.warn(`  ⚠️  No file mapping for book: "${bookName}"`);
    return null;
  }

  const bookData = await fetchBookData(fileName);
  if (!bookData) return null;

  const chapterData = bookData.chapters.find(c => c.chapter === String(chapter));
  if (!chapterData) return null;

  const texts = [];
  for (let v = verseStart; v <= verseEnd; v++) {
    const vd = chapterData.verses.find(vv => vv.verse === String(v));
    if (vd?.text) texts.push(vd.text.trim());
  }
  if (!texts.length) return null;

  const tamilBook = bookData.book?.tamil || bookName;
  const refStr = verseStart === verseEnd
    ? `${tamilBook} ${chapter}:${verseStart}`
    : `${tamilBook} ${chapter}:${verseStart}-${verseEnd}`;

  return { text: texts.join(' '), reference: refStr };
}

function escapeForJs(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function run() {
  console.log('\n' + '═'.repeat(70));
  console.log('  UPDATING TAMIL UNION VERSION TRANSLATIONS');
  console.log('  Source: aruljohn/Bible-tamil (GitHub CDN)');
  console.log('═'.repeat(70) + '\n');

  const scriptPath = path.join(__dirname, 'create-bible-verses.cjs');
  let content = fs.readFileSync(scriptPath, 'utf8');

  if (!content.includes('const birthday = [') || !content.includes('const anniversary = [')) {
    console.error('❌ Could not find verse arrays in create-bible-verses.cjs');
    process.exit(1);
  }

  // Extract every verse object block from the file
  const verseObjRegex = /\{\s*verse_reference:\s*'([^']+)'[\s\S]*?is_active:\s*(?:true|false)\s*\}/g;
  const allMatches = [...content.matchAll(verseObjRegex)];

  console.log(`📖 Found ${allMatches.length} verse objects\n`);

  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < allMatches.length; i++) {
    const [originalBlock, verseRef] = allMatches[i];
    const parsed = parseVerseReference(verseRef);
    const label  = `[${String(i + 1).padStart(3)}/${allMatches.length}] ${verseRef}`;

    if (!parsed) {
      console.log(`  ⚠️  ${label} — could not parse reference`);
      skipped++;
      continue;
    }

    const tamil = await getTamilData(parsed.bookName, parsed.chapter, parsed.verseStart, parsed.verseEnd);

    if (!tamil) {
      console.log(`  ⚠️  ${label} — Tamil text not found`);
      skipped++;
      continue;
    }

    let newBlock = originalBlock
      .replace(
        /verse_text_tamil_reference:\s*'[^']*'/,
        `verse_text_tamil_reference: '${escapeForJs(tamil.reference)}'`
      )
      .replace(
        /verse_text_tamil:\s*'[^']*'/,
        `verse_text_tamil: '${escapeForJs(tamil.text)}'`
      );

    // Use a replacer function to avoid '$' special-char issues in replacement string
    content = content.replace(originalBlock, () => newBlock);
    updated++;
    console.log(`  ✅ ${label}`);

    // Small delay to be polite to the CDN
    await new Promise(r => setTimeout(r, 50));
  }

  fs.writeFileSync(scriptPath, content, 'utf8');

  console.log('\n' + '═'.repeat(70));
  console.log(`  COMPLETE: ${updated} updated, ${skipped} skipped`);
  console.log(`  Saved: ${scriptPath}`);
  console.log('═'.repeat(70) + '\n');
  console.log('💡 Next: node scripts/create-bible-verses.cjs  →  regenerates Excel\n');
}

run().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
