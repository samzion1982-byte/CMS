/* ═══════════════════════════════════════════════════════════════
   fetch-tamil-verses.cjs
   Fetches Tamil Union Version translations from OpenBible-Tamil GitHub
   and updates the verse data with Tamil translations
   
   Run:  node scripts/fetch-tamil-verses.cjs
   ═══════════════════════════════════════════════════════════════ */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Book name mappings from English to Tamil book names and numbers
const BOOK_MAP = {
  'Genesis': { tamil: 'Aasayai Nool', num: 1 },
  'Exodus': { tamil: 'Veettanai Nool', num: 2 },
  'Leviticus': { tamil: 'Levitikasu Nool', num: 3 },
  'Numbers': { tamil: 'Mithunangal Nool', num: 4 },
  'Deuteronomy': { tamil: 'Aagiravamurai Nool', num: 5 },
  'Joshua': { tamil: 'Joshua Nool', num: 6 },
  'Judges': { tamil: 'Nyayathippan Nool', num: 7 },
  'Ruth': { tamil: 'Ruth Nool', num: 8 },
  '1 Samuel': { tamil: 'Samuel Munnurai Nool', num: 9 },
  '2 Samuel': { tamil: 'Samuel Pinurai Nool', num: 10 },
  '1 Kings': { tamil: 'Raja Munnurai Nool', num: 11 },
  '2 Kings': { tamil: 'Raja Pinurai Nool', num: 12 },
  '1 Chronicles': { tamil: 'Varalaru Munnurai Nool', num: 13 },
  '2 Chronicles': { tamil: 'Varalaru Pinurai Nool', num: 14 },
  'Ezra': { tamil: 'Ezra Nool', num: 15 },
  'Nehemiah': { tamil: 'Neman Nool', num: 16 },
  'Esther': { tamil: 'Esther Nool', num: 17 },
  'Job': { tamil: 'Job Nool', num: 18 },
  'Psalm': { tamil: 'Padalgal', num: 19 },
  'Psalms': { tamil: 'Padalgal', num: 19 },
  'Proverbs': { tamil: 'Aanaikal', num: 20 },
  'Ecclesiastes': { tamil: 'Padai Nool', num: 21 },
  'Isaiah': { tamil: 'Yeesayaa Nool', num: 23 },
  'Jeremiah': { tamil: 'Yerenimiyaa Nool', num: 24 },
  'Lamentations': { tamil: 'Vilappai Pattu', num: 25 },
  'Ezekiel': { tamil: 'Yezekiyel Nool', num: 26 },
  'Daniel': { tamil: 'Daniel Nool', num: 27 },
  'Hosea': { tamil: 'Hosea Nool', num: 28 },
  'Joel': { tamil: 'Joel Nool', num: 29 },
  'Amos': { tamil: 'Amos Nool', num: 30 },
  'Obadiah': { tamil: 'Obatyaa Nool', num: 31 },
  'Jonah': { tamil: 'Jonah Nool', num: 32 },
  'Micah': { tamil: 'Mikaa Nool', num: 33 },
  'Nahum': { tamil: 'Naaum Nool', num: 34 },
  'Habakkuk': { tamil: 'Habakkuk Nool', num: 35 },
  'Zephaniah': { tamil: 'Sefaniyaa Nool', num: 36 },
  'Haggai': { tamil: 'Hagai Nool', num: 37 },
  'Zechariah': { tamil: 'Sekariyaa Nool', num: 38 },
  'Malachi': { tamil: 'Malakai Nool', num: 39 },
  'Matthew': { tamil: 'Mathean Iniyai', num: 40 },
  'Mark': { tamil: 'Markuan Iniyai', num: 41 },
  'Luke': { tamil: 'Lukkan Iniyai', num: 42 },
  'John': { tamil: 'Johnan Iniyai', num: 43 },
  'Acts': { tamil: 'Aankusangal', num: 44 },
  'Romans': { tamil: 'Romapilkkup Pattiram', num: 45 },
  '1 Corinthians': { tamil: 'Korindiyarkup Munnurai Pattiram', num: 46 },
  '2 Corinthians': { tamil: 'Korindiyarkup Pinurai Pattiram', num: 47 },
  'Galatians': { tamil: 'Galadiakup Pattiram', num: 48 },
  'Ephesians': { tamil: 'Efesiyarkup Pattiram', num: 49 },
  'Philippians': { tamil: 'Pilipiyarkup Pattiram', num: 50 },
  'Colossians': { tamil: 'Kolosiyarkup Pattiram', num: 51 },
  '1 Thessalonians': { tamil: 'Thessalonikarkup Munnurai Pattiram', num: 52 },
  '2 Thessalonians': { tamil: 'Thessalonikarkup Pinurai Pattiram', num: 53 },
  '1 Timothy': { tamil: 'Timotiykkup Munnurai Pattiram', num: 54 },
  '2 Timothy': { tamil: 'Timotiykkup Pinurai Pattiram', num: 55 },
  'Titus': { tamil: 'Tituskup Pattiram', num: 56 },
  'Philemon': { tamil: 'Philemonkup Pattiram', num: 57 },
  'Hebrews': { tamil: 'Hebreyarkup Pattiram', num: 58 },
  'James': { tamil: 'Jameskup Pattiram', num: 59 },
  '1 Peter': { tamil: 'Peterkkup Munnurai Pattiram', num: 60 },
  '2 Peter': { tamil: 'Peterkkup Pinurai Pattiram', num: 61 },
  '1 John': { tamil: 'Johnnup Munnurai Pattiram', num: 62 },
  '2 John': { tamil: 'Johnnup Pinurai Pattiram', num: 63 },
  '3 John': { tamil: 'Johnnup Munurai Pinurai Pattiram', num: 64 },
  'Jude': { tamil: 'Judekup Pattiram', num: 65 },
  'Revelation': { tamil: 'Gamanam', num: 66 }
};

// Parse verse reference like "Jeremiah 29:11" or "1 Corinthians 13:4-5"
function parseVerseReference(ref) {
  const match = ref.match(/^([\d]?\s*\w+(?:\s+\w+)?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!match) return null;
  
  const bookName = match[1].trim();
  const chapter = parseInt(match[2]);
  const verseStart = parseInt(match[3]);
  const verseEnd = match[4] ? parseInt(match[4]) : verseStart;
  
  return { bookName, chapter, verseStart, verseEnd };
}

// Fetch Tamil verse from OpenBible-Tamil GitHub (raw content)
async function fetchTamilVerse(bookName, chapter, verse) {
  return new Promise((resolve) => {
    const bookInfo = BOOK_MAP[bookName];
    if (!bookInfo) {
      console.warn(`⚠️  Book not found: ${bookName}`);
      resolve({ tamil_text: '', tamil_reference: '' });
      return;
    }

    const bookNum = String(bookInfo.num).padStart(2, '0');
    const chapterStr = String(chapter).padStart(3, '0');
    
    // GitHub raw content URL structure for OpenBible-Tamil
    // Format: https://raw.githubusercontent.com/adonais/OpenBible-Tamil/master/json/{language}/{book_number}.json
    const url = `https://raw.githubusercontent.com/adonais/OpenBible-Tamil/master/json/ta/${bookNum}.json`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const verseData = parsed.verses.find(v => 
            v.chapter === chapter && v.verse === verse
          );
          
          if (verseData) {
            const tamilRef = `${bookInfo.tamil} ${chapter}:${verse}`;
            resolve({ 
              tamil_text: verseData.text || '',
              tamil_reference: tamilRef
            });
          } else {
            resolve({ tamil_text: '', tamil_reference: '' });
          }
        } catch (err) {
          console.warn(`⚠️  Error parsing ${bookName}: ${err.message}`);
          resolve({ tamil_text: '', tamil_reference: '' });
        }
      });
    }).on('error', (err) => {
      console.warn(`⚠️  Error fetching ${bookName}: ${err.message}`);
      resolve({ tamil_text: '', tamil_reference: '' });
    });
  });
}

// Main function to update verses with Tamil translations
async function updateVersesWithTamil() {
  console.log('\n' + '═'.repeat(70));
  console.log('  FETCHING TAMIL UNION VERSION TRANSLATIONS');
  console.log('═'.repeat(70) + '\n');
  
  // Import the birthday and anniversary verse data
  const createScriptPath = path.join(__dirname, 'create-bible-verses.cjs');
  const scriptContent = fs.readFileSync(createScriptPath, 'utf8');
  
  // Extract verse arrays (this is a simplified approach)
  console.log('📖 Parsing verse references...\n');
  
  // We'll need to dynamically require the verses
  delete require.cache[require.resolve(createScriptPath)];
  const { birthday, anniversary } = require(createScriptPath);
  
  const allVerses = [...birthday, ...anniversary];
  let successCount = 0;
  let totalCount = allVerses.length;
  
  for (let i = 0; i < allVerses.length; i++) {
    const verse = allVerses[i];
    const parsed = parseVerseReference(verse.verse_reference);
    
    if (parsed) {
      // Fetch Tamil translation (using first verse in range if range provided)
      const tamilData = await fetchTamilVerse(parsed.bookName, parsed.chapter, parsed.verseStart);
      
      if (tamilData.tamil_text) {
        verse.verse_text_tamil = tamilData.tamil_text;
        verse.verse_text_tamil_reference = tamilData.tamil_reference;
        successCount++;
        console.log(`✅ [${i + 1}/${totalCount}] ${verse.verse_reference} → Tamil mapped`);
      } else {
        console.log(`⚠️  [${i + 1}/${totalCount}] ${verse.verse_reference} → Tamil not found`);
      }
    }
    
    // Rate limiting - add small delay to avoid GitHub API rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n' + '═'.repeat(70));
  console.log(`  FETCH COMPLETE: ${successCount}/${totalCount} verses updated`);
  console.log('═'.repeat(70) + '\n');
  
  return allVerses;
}

// Execute
updateVersesWithTamil().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
