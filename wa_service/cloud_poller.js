const fs = require('fs');
const path = require('path');
const http = require('http');

const TGCLOUD_TOKEN = process.env.TGCLOUD_TOKEN || 'app8815305469:Dhu5fO263BNLzYd4iJe03WPHMaNiIz7oiwX6uzhcKfA';
const BASE_URL = 'https://cloud.telegram.org/app8815305469/manage';
const BOT_TOKEN = process.env.BOT_TOKEN || '8815305469:AAF4GtOlS_sUpGb1Q2f96-8K_fO9LoXP9lo';
const BOT_USERNAME = 'NumberFactoryNumberBot';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const LOG_FILE = path.join(__dirname, 'cloud_poller.log');
const PID_FILE = path.join(__dirname, 'cloud_poller.pid');
const SEEN_FILE = path.join(__dirname, 'delivered_otps.json');

try {
  fs.writeFileSync(PID_FILE, String(process.pid));
} catch {}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 150000) {
      const data = fs.readFileSync(LOG_FILE, 'utf8');
      const lines = data.split('\n').slice(-300);
      fs.writeFileSync(LOG_FILE, lines.join('\n'));
    }
  } catch {}
  console.log(msg);
}

// ── Bold Mathematical Sans-Serif Buttons (Matches main.py / keyboards.js) ──
const _BOLD_SRC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const _BOLD_DST = [
  ...'𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝗫𝘆𝘇𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵',
];
const _TO_BOLD_MAP = new Map();
for (let i = 0; i < _BOLD_SRC.length; i++) {
  _TO_BOLD_MAP.set(_BOLD_SRC[i], _BOLD_DST[i]);
}

function boldButtonText(text) {
  if (!text) return '';
  let out = '';
  for (const ch of String(text)) {
    out += _TO_BOLD_MAP.get(ch) || ch;
  }
  return out;
}

// ── Persistent Deduplication Cache ──
const deliveredKeys = new Set();
try {
  if (fs.existsSync(SEEN_FILE)) {
    const arr = JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'));
    if (Array.isArray(arr)) {
      for (const k of arr) deliveredKeys.add(String(k).trim());
    }
  }
} catch {}

function saveDeliveredKeys() {
  try {
    const arr = Array.from(deliveredKeys).slice(-3000);
    fs.writeFileSync(SEEN_FILE, JSON.stringify(arr));
  } catch {}
}

const PHONE_CODE_TO_ISO = {
  '1': 'US', '7': 'RU', '20': 'EG', '27': 'ZA', '30': 'GR', '31': 'NL', '32': 'BE', '33': 'FR',
  '34': 'ES', '36': 'HU', '39': 'IT', '40': 'RO', '41': 'CH', '43': 'AT', '44': 'GB', '45': 'DK',
  '46': 'SE', '47': 'NO', '48': 'PL', '49': 'DE', '51': 'PE', '52': 'MX', '53': 'CU', '54': 'AR',
  '55': 'BR', '56': 'CL', '57': 'CO', '58': 'VE', '60': 'MY', '61': 'AU', '62': 'ID', '63': 'PH',
  '64': 'NZ', '65': 'SG', '66': 'TH', '81': 'JP', '82': 'KR', '84': 'VN', '86': 'CN', '90': 'TR',
  '91': 'IN', '92': 'PK', '93': 'AF', '94': 'LK', '95': 'MM', '98': 'IR', '212': 'MA', '213': 'DZ',
  '216': 'TN', '218': 'LY', '220': 'GM', '221': 'SN', '222': 'MR', '223': 'ML', '224': 'GN',
  '225': 'CI', '226': 'BF', '227': 'NE', '228': 'TG', '229': 'BJ', '230': 'MU', '231': 'LR',
  '232': 'SL', '233': 'GH', '234': 'NG', '235': 'TD', '236': 'CF', '237': 'CM', '238': 'CV',
  '239': 'ST', '240': 'GQ', '241': 'GA', '242': 'CG', '243': 'CD', '244': 'AO', '245': 'GW',
  '248': 'SC', '249': 'SD', '250': 'RW', '251': 'ET', '252': 'SO', '253': 'DJ', '254': 'KE',
  '255': 'TZ', '256': 'UG', '257': 'BI', '258': 'MZ', '260': 'ZM', '261': 'MG', '263': 'ZW',
  '264': 'NA', '265': 'MW', '266': 'LS', '267': 'BW', '268': 'SZ', '269': 'KM', '291': 'ER',
  '297': 'AW', '298': 'FO', '299': 'GL', '350': 'GI', '351': 'PT', '352': 'LU', '353': 'IE',
  '354': 'IS', '355': 'AL', '356': 'MT', '357': 'CY', '358': 'FI', '359': 'BG', '370': 'LT',
  '371': 'LV', '372': 'EE', '373': 'MD', '374': 'AM', '375': 'BY', '376': 'AD', '377': 'MC',
  '380': 'UA', '381': 'RS', '385': 'HR', '386': 'SI', '387': 'BA', '389': 'MK', '420': 'CZ',
  '421': 'SK', '500': 'FK', '501': 'BZ', '502': 'GT', '503': 'SV', '504': 'HN', '505': 'NI',
  '506': 'CR', '507': 'PA', '509': 'HT', '590': 'GP', '591': 'BO', '592': 'GY', '593': 'EC',
  '595': 'PY', '597': 'SR', '598': 'UY', '670': 'TL', '673': 'BN', '674': 'NR', '675': 'PG',
  '676': 'TO', '677': 'SB', '678': 'VU', '679': 'FJ', '680': 'PW', '685': 'WS', '686': 'KI',
  '687': 'NC', '688': 'TV', '689': 'PF', '691': 'FM', '692': 'MH', '850': 'KP', '852': 'HK',
  '853': 'MO', '855': 'KH', '856': 'LA', '880': 'BD', '886': 'TW', '960': 'MV', '961': 'LB',
  '962': 'JO', '963': 'SY', '964': 'IQ', '965': 'KW', '966': 'SA', '967': 'YE', '968': 'OM',
  '970': 'PS', '971': 'AE', '972': 'IL', '973': 'BH', '974': 'QA', '975': 'BT', '976': 'MN',
  '977': 'NP', '992': 'TJ', '993': 'TM', '994': 'AZ', '995': 'GE', '996': 'KG', '998': 'UZ',
};

const SERVICE_SMS_KEYWORDS = {
  whatsapp: ['whatsapp', 'wa', 'wap', 'w/a', 'whatsapp business', 'wa.me', 'wa code', 'wh', 'واتساب', 'واتساپ', 'واٹس ایپ', 'व्हाट्सएप', 'হোয়াটসঅ্যাপ', 'ватсап'],
  facebook: ['facebook', 'fb', 'meta', 'fbook', 'fb code', 'facebook code', 'فيسبوك', 'فيس بوك'],
  instagram: ['instagram', 'insta', 'ig', 'ig code', 'instagram code', 'انستغرام', 'انستقرام'],
  telegram: ['telegram', 'tg', 'tele', 'telegram code', 'tg code', 't.me', 'تيليجرام', 'تليجرام'],
  tiktok: ['tiktok', 'tik tok', 'tikvideo', 'tiktok code', 'tik code', 'تيك توك'],
  snapchat: ['snapchat', 'snap', 'snap code', 'سناب شات'],
  twitter: ['twitter', 'x.com', 'x code', 'twitter code', 'تويتر'],
  discord: ['discord', 'discord code', 'ديسكورد'],
  viber: ['viber', 'viber code', 'فايبر'],
  line: ['line', 'line code', 'line verification', 'لاين'],
  wechat: ['wechat', 'we chat', 'wechat code', 'وي تشات'],
  signal: ['signal', 'signal code', 'سيجنال'],
  linkedin: ['linkedin', 'linked in', 'লেনদেন', 'লিনকেডিন', 'لينكد إن'],
  imo: ['imo', 'imo code', 'imo verification', 'ايمو'],
  kakaotalk: ['kakao', 'kakaotalk', 'كاكاو'],
  qq: ['qq', 'tencent qq'],
  vk: ['vk', 'vkontakte'],
  google: ['google', 'gmail', 'youtube', 'g-', 'google voice', 'جوجل', 'غوغل'],
  microsoft: ['microsoft', 'ms', 'outlook', 'live.com', 'hotmail'],
  apple: ['apple', 'icloud', 'itunes', 'apple id'],
  yahoo: ['yahoo', 'yahoo code', 'ymail'],
  protonmail: ['proton', 'protonmail'],
  binance: ['binance', 'bnb', 'binances'],
  coinbase: ['coinbase'],
  okx: ['okx', 'okex'],
  kucoin: ['kucoin'],
  bybit: ['bybit'],
  huobi: ['huobi', 'htx'],
  mexc: ['mexc'],
  trustwallet: ['trust wallet', 'trustwallet'],
  bkash: ['bkash', 'b-kash', 'bkash code'],
  nagad: ['nagad', 'nagad code'],
  rocket: ['rocket', 'dutch bangla'],
  upay: ['upay', 'upay code'],
  paypal: ['paypal', 'pay pal'],
  paytm: ['paytm'],
  cashapp: ['cash app', 'cashapp'],
  wise: ['wise', 'transferwise'],
  amazon: ['amazon', 'amzn', 'amazon code'],
  ebay: ['ebay'],
  aliexpress: ['aliexpress', 'ali express'],
  alibaba: ['alibaba'],
  daraz: ['daraz', 'daraz code'],
  foodpanda: ['foodpanda', 'food panda'],
  uber: ['uber', 'uber code', 'uber verification', 'uber eats'],
  pathao: ['pathao', 'pathao ride'],
  netflix: ['netflix', 'netflix code'],
  spotify: ['spotify', 'spotify code'],
  steam: ['steam', 'steam guard'],
  epicgames: ['epic games', 'epicgames'],
};

function getIsoFromNumber(numStr) {
  const clean = String(numStr || '').replace(/\D/g, '');
  for (const plen of [3, 2, 1]) {
    const code = clean.slice(0, plen);
    if (PHONE_CODE_TO_ISO[code]) return PHONE_CODE_TO_ISO[code];
  }
  return 'XX';
}

function getFlagInfoHtml(numOrIso, flagsDb) {
  const str = String(numOrIso || '').trim();
  const db = flagsDb || {};

  // Check by dial code or ISO
  if (db[str]) {
    const d = db[str];
    if (d.id) return `<tg-emoji emoji-id="${d.id}">${d.char || '🌍'}</tg-emoji>`;
    if (d.char) return d.char;
  }

  for (const d of Object.values(db)) {
    if (d && d.iso && String(d.iso).toUpperCase() === str.toUpperCase()) {
      if (d.id) return `<tg-emoji emoji-id="${d.id}">${d.char || '🌍'}</tg-emoji>`;
      if (d.char) return d.char;
    }
  }

  // Fallback: standard regional indicator flag
  if (str.length === 2) {
    const c1 = str.toUpperCase().charCodeAt(0) - 65 + 0x1f1e6;
    const c2 = str.toUpperCase().charCodeAt(1) - 65 + 0x1f1e6;
    if (c1 >= 0x1f1e6 && c1 <= 0x1f1ff && c2 >= 0x1f1e6 && c2 <= 0x1f1ff) {
      return String.fromCodePoint(c1, c2);
    }
  }

  // Dial code lookup
  const clean = str.replace(/\D/g, '');
  for (const plen of [3, 2, 1]) {
    const code = clean.slice(0, plen);
    if (db[code]) {
      const d = db[code];
      if (d.id) return `<tg-emoji emoji-id="${d.id}">${d.char || '🌍'}</tg-emoji>`;
      if (d.char) return d.char;
    }
    const iso = PHONE_CODE_TO_ISO[code];
    if (iso && iso.length === 2) {
      const c1 = iso.charCodeAt(0) - 65 + 0x1f1e6;
      const c2 = iso.charCodeAt(1) - 65 + 0x1f1e6;
      return String.fromCodePoint(c1, c2);
    }
  }

  return '🌍';
}

function getCountryName(iso, flagsDb) {
  if (!iso || iso === 'XX') return 'Global';
  const db = flagsDb || {};
  for (const d of Object.values(db)) {
    if (d && d.iso && String(d.iso).toUpperCase() === String(iso).toUpperCase()) {
      return d.name || iso;
    }
  }
  return iso;
}

function detectService(text) {
  const textLower = String(text || '').toLowerCase();
  for (const [serviceKey, keywords] of Object.entries(SERVICE_SMS_KEYWORDS)) {
    for (const kw of keywords) {
      if (textLower.includes(kw.toLowerCase())) {
        return serviceKey.toUpperCase();
      }
    }
  }
  return null;
}

function resolveService(cliField, matchedService, msgText) {
  // 1. If user matched an active session, that session explicitly requested this service
  if (matchedService && String(matchedService).trim().length > 0) {
    return String(matchedService).trim();
  }

  // 2. Keyword detection in message body (e.g. "Telegram code", "WhatsApp code", "LinkedIn", etc.)
  const fromMsg = detectService(msgText);
  if (fromMsg) return fromMsg;

  // 3. Sender CLI (if not a generic label like Likely Scam, Verify, SMS, etc.)
  const cli = String(cliField || '').trim();
  const cliUpper = cli.toUpperCase();
  const isGeneric = !cli || ['LIKELY SCAM', 'SCAM', 'SMS', 'VERIFY', 'NOTICE', 'ALERT', 'INFO', 'AUTH'].includes(cliUpper);
  if (!isGeneric) {
    const fromCli = detectService(cli);
    if (fromCli) return fromCli;
    return cli;
  }

  // 4. Default to 'TELEGRAM' if nothing else detected
  return 'TELEGRAM';
}

function getServiceInfoHtml(serviceText, msgText, appsDb) {
  const s = String(serviceText || '').toUpperCase().trim();
  const m = String(msgText || '').toLowerCase().trim();
  const apps = appsDb || {};

  function checkApp(key) {
    const kUp = String(key || '').toUpperCase().trim();
    if (!kUp) return null;
    if (apps[kUp]) {
      const d = apps[kUp];
      const fullName = d.name || kUp;
      const char = d.char || '📱';
      const eid = d.id;
      if (eid) return [fullName, `<tg-emoji emoji-id="${eid}">${char}</tg-emoji>`];
      return [fullName, char];
    }
    for (const [appName, d] of Object.entries(apps)) {
      if (kUp === appName || (kUp.length >= 4 && appName.includes(kUp))) {
        const fullName = d.name || appName;
        const char = d.char || '📱';
        const eid = d.id;
        if (eid) return [fullName, `<tg-emoji emoji-id="${eid}">${char}</tg-emoji>`];
        return [fullName, char];
      }
    }
    return null;
  }

  let res = checkApp(s);
  if (res) return res;

  if (m) {
    const detected = detectService(m);
    if (detected) {
      res = checkApp(detected);
      if (res) return res;
    }
  }

  // Default fallback premium emojis
  if (s.includes('WHATSAPP') || m.includes('whatsapp')) {
    return ['WhatsApp', '<tg-emoji emoji-id="5334998226636390258">📞</tg-emoji>'];
  }
  if (s.includes('TELEGRAM') || m.includes('telegram')) {
    return ['Telegram', '<tg-emoji emoji-id="5330237710655306682">✈️</tg-emoji>'];
  }
  if (s.includes('LINKEDIN') || m.includes('linkedin') || m.includes('লেনদেন')) {
    return ['LinkedIn', '<tg-emoji emoji-id="5453866707888152017">💼</tg-emoji>'];
  }
  if (s.includes('FACEBOOK') || m.includes('facebook')) {
    return ['Facebook', '<tg-emoji emoji-id="5323261730283863478">📘</tg-emoji>'];
  }
  if (s.includes('INSTAGRAM') || m.includes('instagram')) {
    return ['Instagram', '<tg-emoji emoji-id="5319160079465857105">📸</tg-emoji>'];
  }
  return [s || 'SMS', '📱'];
}

function maskNumForGroup(num, maskName = 'ATIAR') {
  const tag = `◆${maskName || 'ATIAR'}◆`;
  const clean = String(num || '').replace(/\s+/g, '');
  const prefix = clean.startsWith('+') ? '+' : '';
  const digits = prefix ? clean.slice(1) : clean;
  if (digits.length > 9) {
    return `${prefix}${digits.slice(0, 6)}${tag}${digits.slice(-3)}`;
  } else if (digits.length > 5) {
    return `${prefix}${digits.slice(0, 3)}${tag}${digits.slice(-2)}`;
  }
  return clean;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractOtpCode(text) {
  const cleanText = String(text || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (!cleanText) return null;
  if (/^\d{4}[-/.]\d{2}[-/.]\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?$/.test(cleanText)) {
    return null;
  }
  const cleanNoDates = cleanText
    .replace(/\b\d{4}[-/.]\d{2}[-/.]\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g, ' ')
    .replace(/\b\d{2}[-/.]\d{2}[-/.]\d{2,4}\b/g, ' ')
    .replace(/\b\d{2}:\d{2}(?::\d{2})?\b/g, ' ');

  const multiPart = cleanNoDates.match(/(\d{3}[-\s]+\d{3})|(\d{2}[-\s]+\d{2}[-\s]+\d{2})/);
  if (multiPart) return multiPart[0].replace(/\s+/g, '-');

  const kwMatch = cleanNoDates.match(
    /(?:code|is|otp|pin|verification|auth|কোড|رمز|your code)\s*(?:is|:|-|=)?\s*([a-z0-9]{4,10})/i
  );
  if (kwMatch && /^\d+$/.test(kwMatch[1])) return kwMatch[1];

  const kwRev = cleanNoDates.match(/([a-z0-9]{4,10})\s*(?:is your|is the|কোড)/i);
  if (kwRev && /^\d+$/.test(kwRev[1])) return kwRev[1];

  const gMatch = cleanNoDates.match(/G-(\d{6})/i);
  if (gMatch) return gMatch[1];

  const digitMatches = cleanNoDates.match(/(?<!\d)\d{4,8}(?!\d)/);
  if (digitMatches) return digitMatches[0];

  return null;
}

function getBdTodayStr(dateObj = null) {
  const d = dateObj || new Date();
  const bd = new Date(d.getTime() + 6 * 3600 * 1000);
  return bd.toISOString().slice(0, 10);
}

function getBdTimeFormatted(dateObj = null) {
  const d = dateObj || new Date();
  const bd = new Date(d.getTime() + 6 * 3600 * 1000);
  const hours = bd.getUTCHours();
  const minutes = String(bd.getUTCMinutes()).padStart(2, '0');
  const seconds = String(bd.getUTCSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
}

function formatPanelTime(rawTime) {
  if (!rawTime) return null;
  const s = String(rawTime).trim();
  if (!s) return null;
  if (/^\d{2}:\d{2}(:\d{2})?\s*(AM|PM)?$/i.test(s)) {
    return s;
  }
  try {
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      return getBdTimeFormatted(parsed);
    }
  } catch {}
  return s;
}

function parseTimestampMs(rawTime) {
  if (!rawTime) return null;
  const s = String(rawTime).trim();
  if (!s) return null;

  if (/^\d{10,13}$/.test(s)) {
    const num = Number(s);
    return s.length === 10 ? num * 1000 : num;
  }

  let parsed = Date.parse(s);
  if (!isNaN(parsed)) return parsed;

  parsed = Date.parse(s.replace(' ', 'T'));
  if (!isNaN(parsed)) return parsed;

  return null;
}

function resolvePanelUrls(p) {
  if (!p) return [];
  if (p.status === 'OFF') return [];

  const rawName = String(p.name || '').toLowerCase();
  const rawLogin = String(p.login_url || '').toLowerCase();
  const rawMsg = String(p.msg_link || '').toLowerCase();
  const rawApi = String(p.api_url || p.full_api_url || p.url || '').toLowerCase();
  const isIms =
    rawName.includes('ims') ||
    rawLogin.includes('imssms.org') ||
    rawMsg.includes('imssms.org') ||
    rawApi.includes('imssms.org');

  let token = String(p.token || '').trim();
  if (!token) {
    const allUrls = [p.full_api_url, p.api_url, p.url, p.msg_link, p.login_url].filter(Boolean);
    for (const testU of allUrls) {
      try {
        const uStr = String(testU).startsWith('http') ? String(testU) : `https://${testU}`;
        const parsedU = new URL(uStr);
        const qTok = parsedU.searchParams.get('token') || parsedU.searchParams.get('apiKey') || parsedU.searchParams.get('key');
        if (qTok) {
          token = qTok.trim();
          break;
        }
      } catch {}
    }
  }
  if (!token && p.password && String(p.password).trim().length >= 25) {
    token = String(p.password).trim();
  }

  if (isIms) {
    const tok = token || '2dvhMZSWs_UscI2PiFboIR9Ete-yo0QPcUCRl2MF7L0';
    return [`https://imssms.org/api/v1/cdrs?token=${tok}&limit=5`];
  }

  let fullUrl = String(p.full_api_url || '').trim();
  let url = String(p.api_url || p.url || p.msg_link || '').trim();
  if (fullUrl && !fullUrl.startsWith('http')) fullUrl = 'http://' + fullUrl;
  if (url && !url.startsWith('http')) url = 'http://' + url;

  function appendOpt(u) {
    let out = u;
    if (out.includes('imssms.org') && !out.includes('limit=')) {
      out += (out.includes('?') ? '&' : '?') + 'limit=5';
    }
    if (out.includes('records=20')) {
      out = out.replace(/records=20/g, 'records=5');
    }
    return encodeURI(out);
  }

  if (fullUrl) return [appendOpt(fullUrl)];

  if (url) {
    if (url.includes('{token}') || url.includes('{key}')) {
      return [appendOpt(url.replace(/\{token\}/g, token).replace(/\{key\}/g, token))];
    }
    if (url.includes('token=') || url.includes('key=') || url.includes('apiKey=') || !token) {
      return [appendOpt(url)];
    }
    const sep = url.includes('?') ? '&' : '?';
    return [appendOpt(`${url}${sep}token=${token}`)];
  }

  return [];
}

let activePanels = [
  { name: 'IMS CDRs', url: 'https://imssms.org/api/v1/cdrs?token=2dvhMZSWs_UscI2PiFboIR9Ete-yo0QPcUCRl2MF7L0&limit=5' },
  { name: 'telw', url: 'https://server.teleroutex.com/api/message-data-record/viewstats?apiKey=qV5PBKz6CzhcKJ5fLhz696QQGFwE9ypBYgh55AtW73M%3D' },
  { name: 'Number panel', url: 'http://147.135.212.197/crapi/st/viewstats?token=RVVRRUNBUzRcaIZjanGZhVNnb3R1k3laX4CAaIlQlkNTdVFzfphyZQ==&dt1=2026-10-01%2012:01:42&dt2=2032-12-07%2012:01:46&records=5' },
  { name: 'Reno SMS', url: 'http://38.29.171.93/api/v1/messages?token=reno-user-3f9e4dnn3oim6bzlkifz' },
];

let defaultEmojis = { premium_flags: {}, premium_apps: {} };
try {
  const defPath = path.join(__dirname, 'default_emojis.json');
  if (fs.existsSync(defPath)) {
    defaultEmojis = JSON.parse(fs.readFileSync(defPath, 'utf8'));
  }
} catch (e) {
  log(`default_emojis load notice: ${e.message}`);
}

let cachedActiveState = {
  user_active_sessions: {},
  batch_assigned_numbers: {},
  assigned_number_file_map: {},
  processed_otps: [],
  active_users_meta: {},
  fw_groups: [{ chat_id: '-1003635095330', buttons: [] }],
  otp_log_group: '-1004495280691',
  otp_log_enabled: true,
  user_otp_notify: true,
  main_channel: 'https://t.me/NumberFactory247',
  otp_mask_name: 'ATIAR',
  premium_flags: defaultEmojis.premium_flags || {},
  premium_apps: defaultEmojis.premium_apps || {},
  otp_reward: 0,
};

let cachedSources = null;
let lastSourcesAt = 0;
let lastStateSyncAt = 0;
let isSyncingState = false;
let activeStateSyncPromise = null;

async function getSources() {
  if (cachedSources) return cachedSources;
  try {
    const res = await fetch(`${BASE_URL}/get`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${TGCLOUD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (data && data.ok && data.result && data.result.canonical_modules) {
      cachedSources = data.result.canonical_modules;
      lastSourcesAt = Date.now();
      return cachedSources;
    }
  } catch (err) {
    log(`getSources error: ${err.message}`);
  }
  return cachedSources;
}

async function syncActiveStateFromCloud() {
  if (isSyncingState && activeStateSyncPromise) return activeStateSyncPromise;
  isSyncingState = true;
  activeStateSyncPromise = (async () => {
    try {
      const sources = await getSources();
      if (!sources) return;

      const res = await fetch(`${BASE_URL}/run`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TGCLOUD_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          module: 'endpoints/poll',
          sources,
          args: { get_active_state: true },
          ctx: {},
        }),
        signal: AbortSignal.timeout(5000),
      });

      const data = await res.json();
      if (data && data.ok && data.result && data.result.result && data.result.result.json) {
        const parsed = JSON.parse(data.result.result.json);
        if (parsed.active_users_meta) {
          const todayStr = getBdTodayStr();
          for (const meta of Object.values(parsed.active_users_meta)) {
            if (meta && meta.today_otp_date !== todayStr) {
              meta.today_otps = 0;
              meta.today_otp_date = todayStr;
            }
          }
        }
        cachedActiveState = {
          ...cachedActiveState,
          ...parsed,
          premium_flags: { ...defaultEmojis.premium_flags, ...(parsed.premium_flags || {}) },
          premium_apps: { ...defaultEmojis.premium_apps, ...(parsed.premium_apps || {}) },
        };
        lastStateSyncAt = Date.now();

        if (Array.isArray(parsed.processed_otps)) {
          for (const k of parsed.processed_otps) {
            deliveredKeys.add(String(k).trim());
          }
        }

        if (Array.isArray(parsed.panels) && parsed.panels.length > 0) {
          const dynamicPanels = [];
          for (const p of parsed.panels) {
            const urls = resolvePanelUrls(p);
            for (const u of urls) {
              dynamicPanels.push({ name: p.name || 'Panel', url: u });
            }
          }
          if (dynamicPanels.length > 0) activePanels = dynamicPanels;
        }
      }
    } catch (err) {
      log(`syncActiveStateFromCloud notice: ${err.message}`);
    } finally {
      isSyncingState = false;
      activeStateSyncPromise = null;
    }
  })();
  return activeStateSyncPromise;
}

async function sendTelegram(method, payload) {
  try {
    const res = await fetch(`${TELEGRAM_API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000),
    });
    const d = await res.json();
    if (!d.ok) {
      log(`sendTelegram [${method}] error: ${d.description}`);
    }
    return d;
  } catch (err) {
    log(`sendTelegram [${method}] exception: ${err.message}`);
    return { ok: false, description: err.message };
  }
}

async function notifyCloudDelivered(syncData, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const sources = await getSources();
      if (!sources) return;
      const res = await fetch(`${BASE_URL}/run`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TGCLOUD_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          module: 'endpoints/poll',
          sources,
          args: { sync_delivered_otp: syncData },
          ctx: {},
        }),
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        return;
      }
      log(`notifyCloudDelivered attempt ${attempt} returned status ${res.status}`);
    } catch (err) {
      log(`notifyCloudDelivered attempt ${attempt} error: ${err.message}`);
    }
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, attempt * 800));
    }
  }
}

function matchUserForNumber(cleanNum) {
  const sessions = cachedActiveState.user_active_sessions || {};
  for (const [uid, sess] of Object.entries(sessions)) {
    for (const actNum of (sess && sess.nums) || []) {
      const actClean = String(actNum || '').replace(/\D/g, '');
      if (
        actClean === cleanNum ||
        (Math.min(actClean.length, cleanNum.length) >= 8 &&
          (cleanNum.endsWith(actClean) || actClean.endsWith(cleanNum)))
      ) {
        return {
          ownerId: String(uid),
          session: sess,
          fileName: sess.file_name || `${sess.service || 'SMS'} - ${sess.country || 'Global'}`,
          service: sess.service || 'Telegram',
          country: sess.country || 'Global',
        };
      }
    }
  }

  // Strictly DO NOT fall back to batch_assigned_numbers or past historical assignments!
  // If the number is not in an active session, no user currently holds it.
  return null;
}

function matchUserForNumberFresh(cleanNum) {
  const matched = matchUserForNumber(cleanNum);
  if (!matched && Date.now() - lastStateSyncAt >= 5000) {
    syncActiveStateFromCloud().catch(() => {});
  }
  return matched;
}

// ── Instant Direct Dispatch With Full Premium Emojis & Bold Styling ──
async function dispatchOtpDirect(rawNum, rawOtp, msgText, rawPanelTime, panelName, cliField = null) {
  const cleanDigits = String(rawNum || '').replace(/\D/g, '');
  const cleanOtp = String(rawOtp || '').trim();
  const cleanDigitsOtp = cleanOtp.replace(/\D/g, '');
  if (!cleanDigits || !cleanOtp) return false;

  const normUniqueId = `${cleanDigits}_${cleanOtp}`;
  if (
    deliveredKeys.has(normUniqueId) ||
    (cleanDigitsOtp && deliveredKeys.has(`${cleanDigits}_${cleanDigitsOtp}`)) ||
    (cachedActiveState.processed_otps || []).includes(normUniqueId) ||
    (cleanDigitsOtp && (cachedActiveState.processed_otps || []).includes(`${cleanDigits}_${cleanDigitsOtp}`))
  ) {
    return false;
  }

  // Check timestamp age: Reject stale / historical OTPs older than 3 minutes (180s)
  if (rawPanelTime) {
    const itemMs = parseTimestampMs(rawPanelTime);
    if (itemMs && (Date.now() - itemMs > 180 * 1000)) {
      deliveredKeys.add(normUniqueId);
      deliveredKeys.add(`+${cleanDigits}_${cleanOtp}`);
      if (cleanDigitsOtp) {
        deliveredKeys.add(`${cleanDigits}_${cleanDigitsOtp}`);
        deliveredKeys.add(`+${cleanDigits}_${cleanDigitsOtp}`);
      }
      return false;
    }
  }

  const tStart = Date.now();
  const matched = matchUserForNumberFresh(cleanDigits);
  const ownerId = matched ? matched.ownerId : null;

  // Lock locally immediately after the final owner lookup so a stale cache
  // never burns the OTP as GroupOnly before the real user can be matched.
  deliveredKeys.add(normUniqueId);
  deliveredKeys.add(`+${cleanDigits}_${cleanOtp}`);
  if (cleanDigitsOtp) {
    deliveredKeys.add(`${cleanDigits}_${cleanDigitsOtp}`);
    deliveredKeys.add(`+${cleanDigits}_${cleanDigitsOtp}`);
  }
  saveDeliveredKeys();

  const rawService = resolveService(cliField, matched ? matched.service : null, msgText);
  const iso = getIsoFromNumber(cleanDigits);

  const flagsDb = cachedActiveState.premium_flags || {};
  const appsDb = cachedActiveState.premium_apps || {};
  const maskName = cachedActiveState.otp_mask_name || 'ATIAR';

  const flagHtml = getFlagInfoHtml(cleanDigits, flagsDb);
  const [appFullName, premAppHtml] = getServiceInfoHtml(rawService, msgText, appsDb);
  const countryName = getCountryName(iso, flagsDb);
  const fileName = matched ? matched.fileName : 'External / Unmatched';

  const userMeta = (ownerId && cachedActiveState.active_users_meta && cachedActiveState.active_users_meta[ownerId]) || {};
  const usernameStr = ownerId && userMeta.username ? `@${userMeta.username.replace(/^@/, '')}` : 'N/A';
  const nameVal = ownerId ? (userMeta.name || `User ${ownerId || ''}`).trim() : 'User';
  const totalSms = ownerId ? Number(userMeta.total_otps || 0) + 1 : 1;
  const todayStr = getBdTodayStr();
  const isToday = userMeta.today_otp_date === todayStr;
  const currentToday = isToday ? Number(userMeta.today_otps || 0) : 0;
  const todaySms = ownerId ? currentToday + 1 : 1;

  if (ownerId && cachedActiveState.active_users_meta) {
    cachedActiveState.active_users_meta[ownerId] = {
      ...userMeta,
      total_otps: totalSms,
      today_otps: todaySms,
      today_otp_date: todayStr,
    };
  }

  const panelTimeDisplay = formatPanelTime(rawPanelTime) || getBdTimeFormatted();
  const sentTimeDisplay = getBdTimeFormatted();
  const maskedGroupNum = maskNumForGroup(`+${cleanDigits}`, maskName);
  const copyDigits = cleanOtp.replace(/\D/g, '') || cleanOtp;

  log(`⚡ [FAST DISPATCH] Number: +${cleanDigits} | OTP: ${cleanOtp} | Owner: ${ownerId || 'GroupOnly'} | Panel: ${panelName}`);

  // ── 1. DELIVER TO USER INBOX FIRST (<100ms) ──
  if (ownerId && cachedActiveState.user_otp_notify !== false) {
    const userMsg = `${flagHtml} ${escapeHtml(countryName)} ${premAppHtml} <code>+${cleanDigits}</code>`;
    const userKb = [
      [
        {
          text: String(cleanOtp),
          icon_custom_emoji_id: '5353022963132174959',
          copy_text: { text: copyDigits },
          style: 'success',
        },
      ],
    ];

    const reward = Number(cachedActiveState.otp_reward ?? 0.1);
    if (reward > 0) {
      userKb.push([
        {
          text: `Added ${reward} tk`,
          icon_custom_emoji_id: '5420396762189831222',
          callback_data: 'ignore',
          style: 'primary',
        },
      ]);
    }

    await sendTelegram('sendMessage', {
      chat_id: ownerId,
      text: userMsg,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: userKb },
    });
  }

  // ── 2. DELIVER TO OTP GROUP SECOND (<100ms) ──
  const fwGroups = cachedActiveState.fw_groups || [{ chat_id: '-1003635095330', buttons: [] }];
  // Exact format matching the bot: [FlagHtml] [ISO] [PremAppHtml] [MaskedNum]
  const groupMsg = `${flagHtml} ${iso.toUpperCase()} ${premAppHtml} ${maskedGroupNum}`;

  const groupKb = [
    [
      {
        text: boldButtonText(cleanOtp),
        icon_custom_emoji_id: '5251227707026470504',
        copy_text: { text: copyDigits },
        style: 'success',
      },
    ],
    [
      {
        text: boldButtonText('Number Bot'),
        icon_custom_emoji_id: '5231012545799666522',
        url: `https://t.me/${BOT_USERNAME}`,
        style: 'primary',
      },
      {
        text: boldButtonText('Main Channel'),
        icon_custom_emoji_id: '5217822164362739968',
        url: cachedActiveState.main_channel || 'https://t.me/NumberFactory247',
        style: 'danger',
      },
    ],
  ];

  await Promise.allSettled(
    fwGroups.map((fw) => {
      if (!fw || !fw.chat_id) return Promise.resolve();
      const customKb = groupKb.map((r) => [...r]);
      for (const btn of fw.buttons || []) {
        const bObj = { text: boldButtonText(btn.text), url: btn.url, style: 'primary' };
        if (btn.icon_custom_emoji_id) bObj.icon_custom_emoji_id = btn.icon_custom_emoji_id;
        customKb.push([bObj]);
      }
      return sendTelegram('sendMessage', {
        chat_id: fw.chat_id,
        text: groupMsg,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: customKb },
      });
    })
  );

  // ── 3. DELIVER TO LOCK / LOG GROUP THIRD (<100ms) ──
  if (cachedActiveState.otp_log_enabled !== false) {
    const logGroup = cachedActiveState.otp_log_group || '-1004495280691';
    const logMsg =
      `🔐 <b>LOCK GROUP — SMS LOG</b>\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `👤 Username: ${usernameStr}\n` +
      `🪪 Name: ${escapeHtml(nameVal)}\n` +
      `🆔 User ID: ${ownerId || 'GroupOnly'}\n` +
      `📱 Number: +${cleanDigits}\n` +
      `📂 File: <b>${escapeHtml(fileName)}</b>\n` +
      `🌐 Service: <b>${escapeHtml(appFullName)}</b>\n` +
      `🔢 OTP: ${escapeHtml(cleanOtp)}\n` +
      `📊 Total SMS: <b>${totalSms}</b>\n` +
      `📅 Today SMS: <b>${todaySms}</b>\n` +
      `⏱ Panel Time: <b>${escapeHtml(panelTimeDisplay)}</b>\n` +
      `⏰ OTP Sent Time: <b>${escapeHtml(sentTimeDisplay)}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━`;

    await sendTelegram('sendMessage', {
      chat_id: logGroup,
      text: logMsg,
      parse_mode: 'HTML',
    });
  }

  log(`🚀 SUCCESS: Delivered OTP in ${Date.now() - tStart}ms! [Panel Time: ${panelTimeDisplay} vs Sent Time: ${sentTimeDisplay}]`);

  // ── 4. BACKGROUND CLOUD SYNC (SQLite balance, today count, button emoji) ──
  notifyCloudDelivered({
    number: `+${cleanDigits}`,
    otp: cleanOtp,
    userId: ownerId,
    service: appFullName,
    fileName,
    panelTime: panelTimeDisplay,
    reward: Number(cachedActiveState.otp_reward || 0),
  }).catch(() => {});

  return true;
}

const domainBackoff = new Map();

function getDomain(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('imssms')) return 'imssms.org';
    const tok = u.searchParams.get('token') || u.searchParams.get('apiKey') || '';
    return `${u.hostname}_${tok ? tok.slice(-8) : u.pathname}`;
  } catch {
    return url;
  }
}

function getMinDomainInterval(domain) {
  if (domain && domain.includes('imssms')) return 1500;
  return 600;
}

async function fetchOnePanel(panel) {
  try {
    const res = await fetch(panel.url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) {
      if (res.status === 429) {
        try {
          const errData = await res.json();
          const retrySec = Number(errData.retryAfterSeconds || 1.5);
          domainBackoff.set(panel.url || panel.name, Date.now() + Math.max(1200, retrySec * 1000));
        } catch {
          domainBackoff.set(panel.url || panel.name, Date.now() + 1500);
        }
      }
      return [];
    }
    const text = await res.text();
    if (!text || text.length < 5) return [];

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return [];
    }

    const items = Array.isArray(data)
      ? data
      : (data.records || data.data || data.messages || data.result || []);

    const parsedList = [];
    for (const item of items) {
      if (!item) continue;
      let num = item.number || item.num || item.phone || item.msisdn || item.destination || '';
      let msg = item.message || item.msg || item.sms || item.content || item.text || item.body || '';
      let time = item.time || item.date || item.datetime || item.created_at || item.received_at || item.dt || item.createdAt || null;
      const cli = item.cli || item.sender || item.from || null;

      if (!num || !msg) {
        if (typeof item === 'object') {
          for (const val of Object.values(item)) {
            const vStr = String(val || '').trim();
            if (!num && /^\+?\d{7,16}$/.test(vStr.replace(/\D/g, '')) && !vStr.includes('.')) {
              num = vStr;
            } else if (!msg && vStr.length > 5 && extractOtpCode(vStr)) {
              msg = vStr;
            }
          }
        }
      }

      if (num && msg) {
        const otp = extractOtpCode(msg);
        if (otp) {
          parsedList.push({
            number: String(num).replace(/\D/g, ''),
            message: msg,
            otp,
            time,
            cli: cli ? String(cli).trim() : null,
          });
        }
      }
    }
    return parsedList;
  } catch {
    return [];
  }
}

async function main() {
  log(`⚡ [DIRECT DISPATCH ENGINE] High-Speed Background Poller started with PID ${process.pid}`);
  await syncActiveStateFromCloud();
  log(`✅ Initialized with ${activePanels.length} active panels and ${deliveredKeys.size} seen keys.`);

  // Priming pass on startup: Mark stale panel items as seen so historical messages are never dumped,
  // but NEVER swallow fresh items (<180s old) or items belonging to currently active users!
  try {
    log(`🔄 Running startup baseline priming pass on ${activePanels.length} active panels...`);
    const primeResults = await Promise.allSettled(
      activePanels.map((p) => fetchOnePanel(p).then((items) => ({ panel: p, items })))
    );
    let primedCount = 0;
    const now = Date.now();
    for (const res of primeResults) {
      if (res.status !== 'fulfilled' || !res.value || !Array.isArray(res.value.items)) continue;
      for (const item of res.value.items) {
        const cNum = String(item.number || '').replace(/\D/g, '');
        const cOtp = String(item.otp || '').trim();
        if (!cNum || !cOtp) continue;

        // Check if item belongs to an active user session right now
        const isUserNumber = Boolean(matchUserForNumber(cNum));

        // Check age of item
        const itemMs = parseTimestampMs(item.time);
        const isFresh = itemMs && (now - itemMs <= 180 * 1000);

        // If it's fresh OR belongs to an active user waiting for code, DO NOT prime it as seen!
        // Let cycle 1 dispatch it directly to user & group!
        if (isFresh || isUserNumber) {
          log(`⚡ Preserving fresh/active startup item: +${cNum} (OTP: ${cOtp})`);
          continue;
        }

        deliveredKeys.add(`${cNum}_${cOtp}`);
        deliveredKeys.add(`+${cNum}_${cOtp}`);
        primedCount++;
      }
    }
    saveDeliveredKeys();
    log(`✅ Startup priming completed: ${primedCount} stale panel items marked as seen.`);
  } catch (err) {
    log(`Startup priming notice: ${err.message}`);
  }

  const domainLastFetch = new Map();

  const RENDER_HEALTH_URL = process.env.RENDER_HEALTH_URL || 'https://otp-fast-engine.onrender.com';
  let isStandby = false;

  async function checkRenderCloudStatus() {
    try {
      const res = await fetch(RENDER_HEALTH_URL, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const d = await res.json();
        return d && d.status === 'online';
      }
    } catch {}
    return false;
  }

  if (!process.env.RENDER) {
    const renderOnline = await checkRenderCloudStatus();
    if (renderOnline) {
      isStandby = true;
      log('🛡️ [STANDBY MODE] Render Cloud Engine is actively running 24/7 in Frankfurt.');
      log('🛡️ Local worker is in STANDBY mode to prevent duplicate OTP deliveries.');
    }
  }

  let cycle = 0;
  while (true) {
    cycle++;

    if (!process.env.RENDER) {
      if (cycle % 25 === 0) {
        const renderOnline = await checkRenderCloudStatus();
        if (isStandby && !renderOnline) {
          isStandby = false;
          log('⚠️ [ACTIVE TAKEOVER] Render Cloud Engine appears offline! Local worker taking over actively.');
        } else if (!isStandby && renderOnline) {
          isStandby = true;
          log('🛡️ [STANDBY MODE] Render Cloud Engine is online. Local worker returning to STANDBY mode.');
        }
      }
      if (isStandby) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
    }

    // Sync active state from cloud every 30 seconds to completely avoid 429
    if (cycle % 75 === 0 || Date.now() - lastStateSyncAt >= 30000) {
      syncActiveStateFromCloud().catch(() => {});
    }

    try {
      const now = Date.now();
      const readyPanels = [];
      const hasActiveSessions = Object.keys(cachedActiveState.user_active_sessions || {}).length > 0;
      const imsMin = hasActiveSessions ? 1200 : 2500;
      const otherMin = hasActiveSessions ? 600 : 2000;

      for (const p of activePanels) {
        const pKey = p.url || p.name;
        const backoff = domainBackoff.get(pKey) || 0;
        if (now < backoff) continue;
        const last = domainLastFetch.get(pKey) || 0;
        const minInt = p.url && p.url.includes('imssms') ? imsMin : otherMin;
        if (now - last >= minInt) {
          readyPanels.push(p);
          domainLastFetch.set(pKey, now);
        }
      }

      if (readyPanels.length > 0) {
        const results = await Promise.allSettled(
          readyPanels.map((p) => fetchOnePanel(p).then((items) => ({ panel: p, items })))
        );

        const dispatchTasks = [];
        for (const res of results) {
          if (res.status !== 'fulfilled' || !res.value || !Array.isArray(res.value.items)) continue;
          const { panel, items } = res.value;
          for (const item of items) {
            dispatchTasks.push(
              dispatchOtpDirect(item.number, item.otp, item.message, item.time, panel.name, item.cli)
            );
          }
        }
        if (dispatchTasks.length > 0) {
          await Promise.allSettled(dispatchTasks);
        }
      }
    } catch (err) {
      log(`main loop error: ${err.message}`);
    }

    const hasActive = Object.keys(cachedActiveState.user_active_sessions || {}).length > 0;
    await new Promise((r) => setTimeout(r, hasActive ? 400 : 800));
  }
}

process.on('uncaughtException', (err) => {
  log(`fatal uncaughtException (recovered): ${err.message}`);
});

process.on('unhandledRejection', (reason) => {
  log(`fatal unhandledRejection (recovered): ${reason}`);
});

const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
  if (req.url === '/active_sessions' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (payload && payload.uid) {
          const uid = String(payload.uid);
          if (payload.session) {
            if (!cachedActiveState.user_active_sessions) cachedActiveState.user_active_sessions = {};
            cachedActiveState.user_active_sessions[uid] = payload.session;
          }
          if (payload.meta) {
            if (!cachedActiveState.active_users_meta) cachedActiveState.active_users_meta = {};
            cachedActiveState.active_users_meta[uid] = payload.meta;
          }
          log(`⚡ [INSTANT SYNC] Session synced for user ${uid} (nums: ${(payload.session.nums || []).join(', ')})`);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400);
        return res.end();
      }
    });
    return;
  }

  if (req.url === '/logs') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    try {
      if (fs.existsSync(LOG_FILE)) {
        const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-150).join('\n');
        return res.end(lines);
      }
    } catch {}
    return res.end('No logs available.');
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      status: 'online',
      service: 'NumberFactory High-Speed OTP Engine',
      uptime: Math.floor(process.uptime()),
      seenKeys: deliveredKeys.size,
      activePanels: activePanels.length,
      timestamp: new Date().toISOString()
    })
  );
});
server.listen(PORT, '0.0.0.0', () => {
  log(`🚀 Health check HTTP server listening on port ${PORT}`);
});

// Self-keepalive: Ping public URL every 10 minutes to prevent Render free tier sleep
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || 'https://otp-fast-engine.onrender.com';
setInterval(async () => {
  try {
    const res = await fetch(RENDER_EXTERNAL_URL);
    log(`[KEEPALIVE] Self-pinged ${RENDER_EXTERNAL_URL} -> status ${res.status}`);
  } catch (err) {
    log(`[KEEPALIVE ERROR] ${err.message}`);
  }
}, 10 * 60 * 1000);

main().catch((err) => {
  log(`fatal main: ${err.message}`);
});
