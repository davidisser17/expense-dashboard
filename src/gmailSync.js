/* ==========================================================================
   SINKRONISASI GMAIL
   - Autorisasi read-only via Google Identity Services (OAuth token client)
   - Pencarian email yang mengindikasikan transaksi/pengeluaran
   - Ekstraksi tanggal, nominal, deskripsi + tebakan kategori otomatis
   ========================================================================== */

// Scope gmail.modify = akses baca + boleh mengubah label (menandai email
// sudah dibaca), TIDAK termasuk menghapus email.
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

// STRATEGI PEMINDAIAN:
// Pencarian mencakup SEMUA email pada periode terpilih (dengan pengecualian
// notifikasi media sosial & kategori forum) — deteksi transaksi dilakukan oleh
// parser pada tiap email, bukan oleh kata kunci pencarian, supaya email
// pengeluaran tidak terlewat hanya karena subjek/pengirimnya berbeda.
const SEARCH_EXCLUSIONS = [
  '-category:social',
  '-category:forums',
  '-from:facebookmail.com',
  '-from:instagram.com',
  '-from:linkedin.com',
  '-from:twitter.com',
  '-from:x.com',
  '-from:tiktok.com',
  '-from:youtube.com',
  '-from:github.com'
].join(' ');

// Subjek berbau promosi HANYA dilewati jika tidak mengandung kata transaksi.
// (Contoh: "Promo Spesial Weekend!" dilewati, tapi "Transaksi Berhasil — Promo
// GoPay" tetap diproses.)
const PROMO_SUBJECT_WORDS = /(promo|diskon|penawaran|voucher|undian|giveaway|newsletter|webinar|e-statement|statement|laporan)/i;
const TRANSACTION_SUBJECT_WORDS = /(transaksi|pembayaran|payment|receipt|struk|invoice|tagihan|order|pesanan|top ?up|paid|berhasil|purchase|refund|beli)/i;

const isPromoSubject = (subject) =>
  PROMO_SUBJECT_WORDS.test(subject) && !TRANSACTION_SUBJECT_WORDS.test(subject);

// Kata kunci tebakan kategori (dicek berurutan; cocok pertama yang menang)
const CATEGORY_KEYWORDS = [
  ['Ngopi', [
    'kopi', 'coffee', 'starbucks', 'espresso', 'latte', 'cappuccino',
    'americano', 'mocha', 'kopi kenangan', 'janji jiwa', 'kopken',
    'ngopi', 'coffee shop', 'kafe', 'cafe'
  ]],
  ['Makan', [
    'makan', 'makanan', 'food', 'gofood', 'grabfood', 'shopeefood',
    'resto', 'restaurant', 'rumah makan', 'mcd', 'mcdonald', 'kfc',
    'pizza', 'burger', 'nasi', 'ayam', 'bakso', 'mie', 'soto', 'sate',
    'satay', 'martabak', 'seblak', 'geprek', 'ramen', 'sushi', 'lunch',
    'dinner', 'breakfast', 'snack', 'jajan', 'cemilan', 'dessert',
    'donut', 'donat', 'roti', 'bakery', 'swalayan', 'grocery',
    'supermarket', 'indomaret', 'alfamart', 'warung'
  ]],
  ['Nongkrong', [
    'nongkrong', 'hangout', 'bioskop', 'cinema', 'cgv', 'xxi',
    'cinepolis', 'karaoke', 'billiard', 'futsal', 'playstation', 'ps '
  ]]
];

/* ---------- Google Identity Services (GIS) ---------- */

const loadGoogleIdentityServices = () => {
  if (window.google?.accounts?.oauth2) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-gis="true"]');
    if (existing) {
      existing.addEventListener('load', resolve);
      existing.addEventListener('error', () =>
        reject(new Error('Gagal memuat Google Identity Services. Cek koneksi internet Anda.'))
      );
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.gis = 'true';
    script.onload = resolve;
    script.onerror = () =>
      reject(new Error('Gagal memuat Google Identity Services. Cek koneksi internet Anda.'));
    document.head.appendChild(script);
  });
};

/* ---------- Cache token di localStorage ----------
   Setelah izin diberikan sekali, token disimpan di browser sehingga
   pemindaian berikutnya tidak perlu popup autorisasi lagi. Token Google
   hanya berlaku ±1 jam; setelah itu diperbarui SENYAP oleh Google
   (tanpa popup) selama user masih login Google di browser. */
const TOKEN_KEY = 'gmailAccessToken';
const TOKEN_EXPIRY_KEY = 'gmailTokenExpiry';
// Buffer 60 detik agar token tidak dipakai saat hampir habis
const EXPIRY_BUFFER_MS = 60 * 1000;

export const getCachedGmailAccessToken = () => {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = Number(localStorage.getItem(TOKEN_EXPIRY_KEY) || 0);
    if (token && expiry > Date.now() + EXPIRY_BUFFER_MS) return token;
  } catch (e) {
    /* localStorage tidak tersedia */
  }
  return null;
};

const saveCachedGmailToken = (token, expiresInSec = 3599) => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + expiresInSec * 1000));
  } catch (e) {
    /* abaikan jika localStorage tidak tersedia */
  }
};

export const clearCachedGmailToken = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
  } catch (e) {
    /* abaikan */
  }
};

/**
 * Minta access token Gmail (read + mark-as-read).
 * - Jika ada token tersimpan di browser yang masih valid → langsung dipakai
 *   TANPA popup sama sekali.
 * - Jika tidak ada/kedaluwarsa → minta ke Google; popup izin hanya muncul
 *   pertama kali. Untuk permintaan berikutnya Google memperbarui token
 *   secara senyap (prompt: '').
 */
export const requestGmailAccessToken = async (clientId) => {
  if (!clientId || !clientId.includes('.apps.googleusercontent.com')) {
    throw new Error('Google OAuth Client ID tidak valid. Format: xxx.apps.googleusercontent.com');
  }

  // Token tersimpan & masih valid → tidak perlu otorisasi ulang
  const cached = getCachedGmailAccessToken();
  if (cached) return cached;

  await loadGoogleIdentityServices();

  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GMAIL_SCOPE,
      callback: (response) => {
        if (response.access_token) {
          saveCachedGmailToken(response.access_token, response.expires_in || 3599);
          resolve(response.access_token);
        } else {
          reject(new Error(response.error_description || 'Autorisasi Gmail dibatalkan atau gagal.'));
        }
      },
      error_callback: (err) => {
        reject(new Error(err.message || 'Autorisasi Gmail gagal. Pastikan Client ID benar dan origin aplikasi sudah terdaftar.'));
      }
    });
    client.requestAccessToken({ prompt: '' });
  });
};


/* ---------- Utilitas parsing email ---------- */

const base64UrlDecode = (data) => {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
};

const getHeader = (msg, name) =>
  msg.payload?.headers?.find((h) => h.name?.toLowerCase() === name?.toLowerCase())?.value || '';

// Decode entity HTML (&nbsp; &#160; dll) agar nominal "Rp&nbsp;10.000"
// pada email berformat HTML tetap terbaca sebagai "Rp 10.000".
const decodeEntities = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&[a-z]+;/gi, ' ');

const getBodyText = (payload) => {
  const parts = [];
  const walk = (p) => {
    if (p?.body?.data) parts.push(p);
    (p?.parts || []).forEach(walk);
  };
  walk(payload);

  const chosen =
    parts.find((p) => p.mimeType === 'text/plain') ||
    parts.find((p) => p.mimeType === 'text/html') ||
    parts[0];

  if (!chosen) return '';

  const decoded = base64UrlDecode(chosen.body.data);
  if (chosen.mimeType === 'text/html') {
    return decodeEntities(
      decoded
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
    );
  }
  return decodeEntities(decoded);
};

/**
 * Ambil nominal rupiah pertama yang masuk akal (>= Rp500) dari teks email.
 * Mendukung format (mata uang di depan ATAU di belakang):
 *   Rp10.000 | Rp 10.000 | Rp. 50.000 | Rp10.345,00 | IDR 100,000.00
 *   10.000 IDR | 25.000 rupiah
 */
export const parseRupiahAmount = (rawText) => {
  // Normalisasi entity HTML & non-breaking space yang mungkin lolos
  const text = rawText.replace(/&nbsp;|&#160;|\u00a0/gi, ' ');

  const patterns = [
    /\b(?:rp|idr)\s*\.?\s*([\d][\d.,]*)/gi, // mata uang di depan angka
    /([\d][\d.,]*)\s*(?:idr|rupiah)\b/gi    // mata uang di belakang angka
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];

    for (const raw of matches) {
      let digits = raw
        .replace(/(?:rp|idr|rupiah)/gi, '')
        .replace(/\s/g, '')
        .replace(/^[.,]+/, '')
        .replace(/[.,]+$/, ''); // buang titik/koma di ujung kalimat

      let value;
      if (/,\d{1,2}$/.test(digits)) {
        // format desimal koma: 10.345,00 -> 10345
        value = parseFloat(digits.replace(/\./g, '').replace(',', '.'));
      } else if (/\.\d{1,2}$/.test(digits) && digits.includes(',')) {
        // format desimal titik + ribuan koma: 100,000.00 -> 100000
        value = parseFloat(digits.replace(/,/g, ''));
      } else {
        // format ribuan titik/koma: 10.345 atau 10,345 -> 10345
        value = parseFloat(digits.replace(/[.,]/g, ''));
      }

      value = Math.round(value || 0);
      if (value >= 500) return value;
    }
  }
  return 0;
};

/**
 * Tebak kategori berdasarkan kata kunci pada subjek + isi email.
 * Default: 'Tak Terduga'.
 */
export const guessCategory = (text) => {
  const lower = ` ${text.toLowerCase()} `;
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return 'Tak Terduga';
};

const toISODate = (ms) => {
  const d = new Date(Number(ms));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const cleanDescription = (subject) =>
  subject
    .replace(/^(fwd|fw|re)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);

const extractSender = (fromValue) => {
  const match = fromValue.match(/^"?(.*?)"?\s*<([^>]+)>$/);
  if (match) return (match[1] || match[2]).trim();
  return fromValue.trim();
};

/**
 * Ubah satu message Gmail menjadi kandidat pengeluaran.
 * Return null jika bukan transaksi (nominal tidak terdeteksi / email promosi).
 */
export const extractExpenseFromMessage = (msg) => {
  const subject = getHeader(msg, 'Subject');
  const from = getHeader(msg, 'From');

  if (isPromoSubject(subject)) return null;

  const bodyText = getBodyText(msg.payload).slice(0, 12000);
  const amount = parseRupiahAmount(`${subject}\n${bodyText}`);
  if (!amount) return null;

  const date = toISODate(msg.internalDate || Date.now());
  const description = cleanDescription(subject) || cleanDescription(from);

  return {
    gmailId: msg.id,
    date,
    description,
    amount,
    category: guessCategory(`${subject}\n${bodyText}`),
    source: extractSender(from)
  };
};

/**
 * Tandai satu email Gmail sebagai sudah dibaca (hapus label UNREAD).
 * Best-effort: dipanggil setelah data transaksi email tersebut disimpan.
 */
export const markMessageAsRead = async (accessToken, messageId) => {
  const res = await fetch(`${GMAIL_API}/messages/${messageId}/modify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
  });
  if (!res.ok) {
    throw new Error(`Gagal menandai email sebagai dibaca (kode ${res.status}).`);
  }
};

/**
 * Pindai Gmail dan kembalikan daftar kandidat pengeluaran.
 * - onProgress(done, total) dipanggil tiap satu email selesai diperiksa.
 * - dateFrom/dateTo (format 'YYYY/M/D') membatasi pencarian ke periode tertentu.
 * - excludeIds (Set) berisi ID email yang sudah pernah disinkronkan,
 *   sehingga tidak muncul lagi saat pemindaian ulang.
 */
export const scanGmailForExpenses = async (
  accessToken,
  onProgress,
  { maxResults = 100, dateFrom = null, dateTo = null, excludeIds = null } = {}
) => {
  const headers = { Authorization: `Bearer ${accessToken}` };

  // Semua email pada periode terpilih dipindai; deteksi transaksi
  // dilakukan parser pada tiap email (bukan kata kunci pencarian).
  const rangeQuery = dateFrom && dateTo
    ? `after:${dateFrom} before:${dateTo}`
    : 'newer_than:6m';
  const query = `${rangeQuery} ${SEARCH_EXCLUSIONS}`;

  const listRes = await fetch(
    `${GMAIL_API}/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
    { headers }
  );

  if (listRes.status === 401) {
    const err = new Error('Sesi Gmail kedaluwarsa. Memperbarui sesi secara otomatis...');
    err.sessionExpired = true;
    throw err;
  }
  if (listRes.status === 403) {
    const err = new Error('Akses Gmail ditolak (403). Pastikan Gmail API aktif & akun Anda terdaftar sebagai Test User di OAuth consent screen.');
    // Token yang tersimpan mungkin diterbitkan SEBELUM konfigurasi Google
    // diperbaiki (mode testing / test user / scope) — tandai agar cache
    // token dibuang dan percobaan berikutnya meminta token yang baru.
    err.tokenInvalid = true;
    throw err;
  }
  if (!listRes.ok) {
    throw new Error(`Gagal mengambil daftar email Gmail (kode ${listRes.status}).`);
  }

  const { messages = [] } = await listRes.json();
  const results = [];

  for (let i = 0; i < messages.length; i++) {
    onProgress?.(i, messages.length);
    try {
      const msgRes = await fetch(`${GMAIL_API}/messages/${messages[i].id}?format=full`, { headers });
      if (!msgRes.ok) continue;
      const msg = await msgRes.json();
      const expense = extractExpenseFromMessage(msg);
      // Lewati email yang sudah pernah disinkronkan (dedup)
      if (expense && !(excludeIds && excludeIds.has(expense.gmailId))) {
        results.push(expense);
      }
    } catch (err) {
      console.error('Gagal memproses satu email, dilewati:', err);
    }
  }

  onProgress?.(messages.length, messages.length);
  return results;
};
