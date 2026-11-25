import type { EntryType } from '../types/vault';

export interface BrandEntry {
  name: string;
  aliases: string[];
  domains: string[];
  defaultType?: EntryType;
}

// Bundled multi-part Public Suffix List for accurate registrable domain extraction offline
export const MULTI_PART_PUBLIC_SUFFIXES = new Set<string>([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk',
  'co.in', 'org.in', 'net.in', 'gov.in', 'ac.in', 'nic.in', 'gen.in', 'ind.in', 'firm.in',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
  'com.br', 'com.mx', 'com.sg', 'com.hk', 'com.tw', 'com.tr',
  'co.nz', 'co.za', 'co.kr', 'co.id', 'com.my', 'com.ph',
  'ac.nz', 'edu.sg', 'gov.sg',
]);

export const KNOWN_PUBLIC_TLDS = new Set<string>([
  'com', 'org', 'net', 'edu', 'gov', 'io', 'co', 'app', 'dev', 'ai', 'me',
  'in', 'uk', 'us', 'ca', 'de', 'fr', 'jp', 'au', 'sg', 'nz', 'nl', 'se',
  'ch', 'eu', 'info', 'biz', 'xyz', 'tech', 'cloud', 'online', 'store',
  'bank', 'money', 'finance', 'shop', 'live', 'pro', 'tv', 'cc', 'gg',
]);

// Curated offline brand & service dictionary (global + Indian banking, UPI, utility & consumer services)
export const BRAND_DICTIONARY: readonly BrandEntry[] = [
  // Global Tech & Social
  { name: 'Google', aliases: ['google', 'gmail', 'google mail', 'gsuite', 'google workspace', 'youtube', 'yt'], domains: ['google.com', 'gmail.com', 'accounts.google.com', 'youtube.com'] },
  { name: 'Instagram', aliases: ['instagram', 'insta', 'ig'], domains: ['instagram.com'] },
  { name: 'Facebook', aliases: ['facebook', 'fb', 'meta'], domains: ['facebook.com', 'fb.com'] },
  { name: 'WhatsApp', aliases: ['whatsapp', 'wa'], domains: ['whatsapp.com'] },
  { name: 'X (Twitter)', aliases: ['twitter', 'x.com'], domains: ['x.com', 'twitter.com'] },
  { name: 'LinkedIn', aliases: ['linkedin', 'lnkd'], domains: ['linkedin.com'] },
  { name: 'Reddit', aliases: ['reddit'], domains: ['reddit.com'] },
  { name: 'Discord', aliases: ['discord'], domains: ['discord.com', 'discordapp.com'] },
  { name: 'Slack', aliases: ['slack'], domains: ['slack.com'] },
  { name: 'Telegram', aliases: ['telegram', 'tg'], domains: ['telegram.org', 't.me'] },
  { name: 'Signal', aliases: ['signal'], domains: ['signal.org'] },
  { name: 'Snapchat', aliases: ['snapchat', 'snap'], domains: ['snapchat.com'] },
  { name: 'Pinterest', aliases: ['pinterest'], domains: ['pinterest.com'] },
  { name: 'TikTok', aliases: ['tiktok'], domains: ['tiktok.com'] },
  { name: 'GitHub', aliases: ['github', 'gh'], domains: ['github.com'] },
  { name: 'GitLab', aliases: ['gitlab'], domains: ['gitlab.com'] },
  { name: 'Bitbucket', aliases: ['bitbucket'], domains: ['bitbucket.org'] },
  { name: 'Apple', aliases: ['apple', 'apple id', 'icloud', 'app store'], domains: ['apple.com', 'icloud.com'] },
  { name: 'Microsoft', aliases: ['microsoft', 'outlook', 'hotmail', 'live', 'office 365', 'onedrive', 'xbox', 'azure'], domains: ['microsoft.com', 'outlook.com', 'live.com', 'hotmail.com', 'office.com'] },
  { name: 'Amazon', aliases: ['amazon', 'amzn', 'aws', 'prime video', 'amazon prime', 'amazon pay'], domains: ['amazon.com', 'amazon.in', 'aws.amazon.com'] },
  { name: 'Netflix', aliases: ['netflix'], domains: ['netflix.com'] },
  { name: 'Spotify', aliases: ['spotify'], domains: ['spotify.com'] },
  { name: 'Adobe', aliases: ['adobe', 'creative cloud'], domains: ['adobe.com'] },
  { name: 'Dropbox', aliases: ['dropbox'], domains: ['dropbox.com'] },
  { name: 'Notion', aliases: ['notion'], domains: ['notion.so', 'notion.site'] },
  { name: 'Figma', aliases: ['figma'], domains: ['figma.com'] },
  { name: 'Linear', aliases: ['linear'], domains: ['linear.app'] },
  { name: 'Vercel', aliases: ['vercel'], domains: ['vercel.com'] },
  { name: 'Cloudflare', aliases: ['cloudflare', 'cf'], domains: ['cloudflare.com'] },
  { name: 'DigitalOcean', aliases: ['digitalocean', 'do'], domains: ['digitalocean.com'] },
  { name: 'Proton', aliases: ['proton', 'protonmail', 'proton mail', 'protonvpn'], domains: ['proton.me', 'protonmail.com'] },
  { name: 'Zoom', aliases: ['zoom'], domains: ['zoom.us'] },
  { name: 'Steam', aliases: ['steam', 'steampowered'], domains: ['steampowered.com', 'steamcommunity.com'] },
  { name: 'Epic Games', aliases: ['epic', 'epic games'], domains: ['epicgames.com'] },
  { name: 'PlayStation', aliases: ['playstation', 'psn'], domains: ['playstation.com'] },
  { name: 'Nintendo', aliases: ['nintendo'], domains: ['nintendo.com'] },
  { name: 'Uber', aliases: ['uber'], domains: ['uber.com'] },
  { name: 'Airbnb', aliases: ['airbnb'], domains: ['airbnb.com'] },
  { name: 'Booking.com', aliases: ['booking', 'booking.com'], domains: ['booking.com'] },
  { name: 'PayPal', aliases: ['paypal'], domains: ['paypal.com'], defaultType: 'BANK' },
  { name: 'Stripe', aliases: ['stripe'], domains: ['stripe.com'], defaultType: 'BANK' },
  { name: 'Wise', aliases: ['wise', 'transferwise'], domains: ['wise.com'], defaultType: 'BANK' },
  { name: 'Coinbase', aliases: ['coinbase'], domains: ['coinbase.com'], defaultType: 'BANK' },
  { name: 'Binance', aliases: ['binance'], domains: ['binance.com'], defaultType: 'BANK' },
  { name: 'OpenAI', aliases: ['openai', 'chatgpt'], domains: ['openai.com', 'chatgpt.com'] },
  { name: 'Anthropic', aliases: ['anthropic', 'claude'], domains: ['anthropic.com', 'claude.ai'] },
  { name: 'Yahoo', aliases: ['yahoo', 'yahoo mail'], domains: ['yahoo.com', 'ymail.com'] },
  { name: 'Zoho', aliases: ['zoho', 'zoho mail'], domains: ['zoho.com', 'zoho.in'] },
  { name: 'WordPress', aliases: ['wordpress', 'wp'], domains: ['wordpress.com', 'wordpress.org'] },
  { name: 'Shopify', aliases: ['shopify'], domains: ['shopify.com'] },
  { name: 'Namecheap', aliases: ['namecheap'], domains: ['namecheap.com'] },
  { name: 'GoDaddy', aliases: ['godaddy'], domains: ['godaddy.com'] },

  // Indian Banking, UPI, Govt & Consumer Services
  { name: 'SBI', aliases: ['sbi', 'state bank', 'state bank of india', 'sbi net banking', 'sbi yono', 'yono', 'yono sbi', 'onlinesbi'], domains: ['onlinesbi.sbi', 'sbi.co.in', 'yonosbi.com'], defaultType: 'BANK' },
  { name: 'HDFC Bank', aliases: ['hdfc', 'hdfc bank', 'hdfc netbanking', 'hdfc net banking', 'payzapp'], domains: ['hdfcbank.com', 'netbanking.hdfcbank.com'], defaultType: 'BANK' },
  { name: 'ICICI Bank', aliases: ['icici', 'icici bank', 'imobile', 'icici netbanking'], domains: ['icicibank.com'], defaultType: 'BANK' },
  { name: 'Axis Bank', aliases: ['axis', 'axis bank', 'axis mobile'], domains: ['axisbank.com'], defaultType: 'BANK' },
  { name: 'Kotak Mahindra Bank', aliases: ['kotak', 'kotak bank', 'kotak 811', 'kotak mahindra'], domains: ['kotak.com'], defaultType: 'BANK' },
  { name: 'Bank of Baroda', aliases: ['bob', 'bank of baroda', 'bob world'], domains: ['bankofbaroda.in'], defaultType: 'BANK' },
  { name: 'Punjab National Bank', aliases: ['pnb', 'pnb one', 'punjab national bank'], domains: ['pnbindia.in'], defaultType: 'BANK' },
  { name: 'Canara Bank', aliases: ['canara', 'canara bank'], domains: ['canarabank.com'], defaultType: 'BANK' },
  { name: 'Union Bank of India', aliases: ['union bank', 'ubi'], domains: ['unionbankofindia.co.in'], defaultType: 'BANK' },
  { name: 'IDFC First Bank', aliases: ['idfc', 'idfc first', 'idfc bank'], domains: ['idfcfirstbank.com'], defaultType: 'BANK' },
  { name: 'IndusInd Bank', aliases: ['indusind', 'indusind bank'], domains: ['indusind.com'], defaultType: 'BANK' },
  { name: 'Yes Bank', aliases: ['yes bank'], domains: ['yesbank.in'], defaultType: 'BANK' },
  { name: 'Paytm', aliases: ['paytm', 'paytm payments'], domains: ['paytm.com'], defaultType: 'BANK' },
  { name: 'PhonePe', aliases: ['phonepe', 'phone pe'], domains: ['phonepe.com'], defaultType: 'BANK' },
  { name: 'Google Pay', aliases: ['gpay', 'google pay', 'tez'], domains: ['pay.google.com'], defaultType: 'BANK' },
  { name: 'BHIM UPI', aliases: ['bhim', 'bhim upi', 'upi'], domains: ['bhimupi.org.in'], defaultType: 'BANK' },
  { name: 'CRED', aliases: ['cred'], domains: ['cred.club'], defaultType: 'BANK' },
  { name: 'Zerodha', aliases: ['zerodha', 'kite', 'zerodha kite', 'coin'], domains: ['zerodha.com', 'kite.zerodha.com'], defaultType: 'BANK' },
  { name: 'Groww', aliases: ['groww'], domains: ['groww.in'], defaultType: 'BANK' },
  { name: 'Upstox', aliases: ['upstox'], domains: ['upstox.com'], defaultType: 'BANK' },
  { name: 'ANGEL ONE', aliases: ['angel one', 'angel broking'], domains: ['angelone.in'], defaultType: 'BANK' },
  { name: 'IRCTC', aliases: ['irctc', 'irctc rail', 'indian railways'], domains: ['irctc.co.in'] },
  { name: 'DigiLocker', aliases: ['digilocker', 'digi locker'], domains: ['digilocker.gov.in'], defaultType: 'IDENTITY' },
  { name: 'UIDAI Aadhaar', aliases: ['aadhaar', 'uidai', 'myaadhaar'], domains: ['uidai.gov.in', 'myaadhaar.uidai.gov.in'], defaultType: 'IDENTITY' },
  { name: 'Income Tax India', aliases: ['income tax', 'e-filing', 'itr', 'pan'], domains: ['incometax.gov.in'] },
  { name: 'EPFO', aliases: ['epfo', 'uan', 'pf'], domains: ['epfindia.gov.in'] },
  { name: 'Passport Seva', aliases: ['passport seva', 'passport'], domains: ['passportindia.gov.in'], defaultType: 'IDENTITY' },
  { name: 'Flipkart', aliases: ['flipkart', 'fk'], domains: ['flipkart.com'] },
  { name: 'Myntra', aliases: ['myntra'], domains: ['myntra.com'] },
  { name: 'Nykaa', aliases: ['nykaa'], domains: ['nykaa.com'] },
  { name: 'Meesho', aliases: ['meesho'], domains: ['meesho.com'] },
  { name: 'Zomato', aliases: ['zomato'], domains: ['zomato.com'] },
  { name: 'Swiggy', aliases: ['swiggy'], domains: ['swiggy.com'] },
  { name: 'Blinkit', aliases: ['blinkit', 'grofers'], domains: ['blinkit.com'] },
  { name: 'Zepto', aliases: ['zepto'], domains: ['zeptonow.com'] },
  { name: 'BigBasket', aliases: ['bigbasket', 'bb'], domains: ['bigbasket.com'] },
  { name: 'BookMyShow', aliases: ['bookmyshow', 'bms'], domains: ['bookmyshow.com'] },
  { name: 'MakeMyTrip', aliases: ['makemytrip', 'mmt'], domains: ['makemytrip.com'] },
  { name: 'Goibibo', aliases: ['goibibo'], domains: ['goibibo.com'] },
  { name: 'Ola', aliases: ['ola', 'ola cabs'], domains: ['olacabs.com'] },
  { name: 'Rapido', aliases: ['rapido'], domains: ['rapido.bike'] },
  { name: 'Jio', aliases: ['jio', 'myjio', 'jiocinema', 'reliance jio'], domains: ['jio.com'] },
  { name: 'Airtel', aliases: ['airtel', 'airtel thanks'], domains: ['airtel.in'] },
  { name: 'Vi (Vodafone Idea)', aliases: ['vodafone', 'vi app'], domains: ['myvi.in'] },
  { name: 'Hotstar', aliases: ['hotstar', 'disney+ hotstar', 'jiohotstar'], domains: ['hotstar.com'] },
  { name: 'SonyLIV', aliases: ['sonyliv', 'sony liv'], domains: ['sonyliv.com'] },
  { name: 'Zee5', aliases: ['zee5'], domains: ['zee5.com'] },
  { name: 'Naukri', aliases: ['naukri'], domains: ['naukri.com'] },
  { name: 'Practo', aliases: ['practo'], domains: ['practo.com'] },
  { name: '1mg', aliases: ['1mg', 'tata 1mg'], domains: ['1mg.com'] },
  { name: 'PharmEasy', aliases: ['pharmeasy'], domains: ['pharmeasy.in'] },

  // Global Banks & Utilities
  { name: 'Chase', aliases: ['chase', 'chase bank'], domains: ['chase.com'], defaultType: 'BANK' },
  { name: 'Bank of America', aliases: ['bofa', 'bank of america'], domains: ['bankofamerica.com'], defaultType: 'BANK' },
  { name: 'Wells Fargo', aliases: ['wells fargo'], domains: ['wellsfargo.com'], defaultType: 'BANK' },
  { name: 'Citibank', aliases: ['citi', 'citibank'], domains: ['citi.com', 'citibank.com'], defaultType: 'BANK' },
  { name: 'HSBC', aliases: ['hsbc'], domains: ['hsbc.com', 'hsbc.co.in'], defaultType: 'BANK' },
  { name: 'American Express', aliases: ['amex', 'american express'], domains: ['americanexpress.com'], defaultType: 'CARD' },
  { name: 'Revolut', aliases: ['revolut'], domains: ['revolut.com'], defaultType: 'BANK' },
];

const aliasLookup = new Map<string, BrandEntry>();
const domainLookup = new Map<string, BrandEntry>();

for (const brand of BRAND_DICTIONARY) {
  aliasLookup.set(brand.name.toLowerCase(), brand);
  for (const alias of brand.aliases) {
    aliasLookup.set(alias.toLowerCase(), brand);
  }
  for (const domain of brand.domains) {
    domainLookup.set(domain.toLowerCase(), brand);
  }
}

export function extractHostname(rawUrlOrDomain: string): string | null {
  const cleaned = rawUrlOrDomain.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split('?')[0].split('#')[0];
  if (!cleaned || !cleaned.includes('.')) return null;
  const host = cleaned.split(':')[0];
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  return host;
}

export function getRegistrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  const lastTwo = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  if (MULTI_PART_PUBLIC_SUFFIXES.has(lastTwo) && parts.length >= 3) {
    return `${parts[parts.length - 3]}.${lastTwo}`;
  }
  return lastTwo;
}

export function isLikelyUrlOrDomain(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed || /\s/.test(trimmed) || trimmed.includes('@')) return false;
  if (/^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(trimmed)) return true;
  const host = extractHostname(trimmed);
  if (!host) return false;
  const parts = host.split('.');
  if (parts.length < 2) return false;
  const tld = parts[parts.length - 1];
  const lastTwo = parts.length >= 2 ? `${parts[parts.length - 2]}.${tld}` : '';
  return KNOWN_PUBLIC_TLDS.has(tld) || MULTI_PART_PUBLIC_SUFFIXES.has(lastTwo);
}

export function matchBrandByText(text: string): BrandEntry | null {
  const norm = text.trim().toLowerCase().replace(/[:\-–—]+$/, '').trim();
  if (!norm) return null;
  const direct = aliasLookup.get(norm);
  if (direct) return direct;

  // Check if text starts with or contains a known multi-word brand alias (e.g., "SBI net banking")
  for (const [alias, brand] of aliasLookup.entries()) {
    if (alias.length >= 3 && (norm === alias || norm.startsWith(`${alias} `) || norm.endsWith(` ${alias}`))) {
      return brand;
    }
  }
  return null;
}

export function matchBrandByDomain(urlOrEmail: string): BrandEntry | null {
  let host: string | null = null;
  if (urlOrEmail.includes('@')) {
    host = urlOrEmail.split('@')[1]?.toLowerCase() ?? null;
  } else {
    host = extractHostname(urlOrEmail);
  }
  if (!host) return null;

  if (domainLookup.has(host)) {
    return domainLookup.get(host)!;
  }
  const registrable = getRegistrableDomain(host);
  if (domainLookup.has(registrable)) {
    return domainLookup.get(registrable)!;
  }
  return null;
}

export function deriveAccountTitleFromDomain(urlOrEmail: string): string | null {
  const brand = matchBrandByDomain(urlOrEmail);
  if (brand) return brand.name;

  const host = urlOrEmail.includes('@')
    ? urlOrEmail.split('@')[1]?.toLowerCase() ?? null
    : extractHostname(urlOrEmail);
  if (!host) return null;

  const registrable = getRegistrableDomain(host);
  const base = registrable.split('.')[0];
  if (!base || base.length < 2) return null;
  return base.charAt(0).toUpperCase() + base.slice(1);
}
