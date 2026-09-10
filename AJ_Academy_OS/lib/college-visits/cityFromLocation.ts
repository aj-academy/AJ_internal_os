/**
 * Pull a city name out of College Visits `location` text.
 * Full street addresses are not used as filter values.
 */

const CITY_ALIASES: Record<string, string> = {
  bangalore: "Bengaluru",
  bengaluru: "Bengaluru",
  bombay: "Mumbai",
  mumbai: "Mumbai",
  calcutta: "Kolkata",
  kolkata: "Kolkata",
  madras: "Chennai",
  chennai: "Chennai",
  vizag: "Visakhapatnam",
  visakhapatnam: "Visakhapatnam",
  vishakhapatnam: "Visakhapatnam",
  trivandrum: "Thiruvananthapuram",
  thiruvananthapuram: "Thiruvananthapuram",
  pondicherry: "Puducherry",
  puducherry: "Puducherry",
  gurgaon: "Gurugram",
  gurugram: "Gurugram",
  mysore: "Mysuru",
  mysuru: "Mysuru",
  belgaum: "Belagavi",
  belagavi: "Belagavi",
  trichy: "Tiruchirappalli",
  tiruchirappalli: "Tiruchirappalli",
  trichur: "Thrissur",
  thrissur: "Thrissur",
  calicut: "Kozhikode",
  kozhikode: "Kozhikode",
  baroda: "Vadodara",
  vadodara: "Vadodara",
  "new delhi": "New Delhi",
  delhi: "Delhi",
  secunderabad: "Secunderabad",
  hyderabad: "Hyderabad",
};

const CITIES = [
  "Adilabad",
  "Agra",
  "Ahmedabad",
  "Amaravati",
  "Amritsar",
  "Anantapur",
  "Aurangabad",
  "Bengaluru",
  "Bhimavaram",
  "Bhopal",
  "Bhubaneswar",
  "Chandigarh",
  "Chennai",
  "Coimbatore",
  "Cuddapah",
  "Delhi",
  "Eluru",
  "Faridabad",
  "Guntur",
  "Gurugram",
  "Guwahati",
  "Gwalior",
  "Hubballi",
  "Hyderabad",
  "Indore",
  "Jabalpur",
  "Jaipur",
  "Jamshedpur",
  "Kadapa",
  "Kakinada",
  "Kalaburagi",
  "Kanpur",
  "Karimnagar",
  "Khammam",
  "Kochi",
  "Kolkata",
  "Kollam",
  "Kozhikode",
  "Kurnool",
  "Lucknow",
  "Ludhiana",
  "Madurai",
  "Mahabubnagar",
  "Mangaluru",
  "Medak",
  "Meerut",
  "Mumbai",
  "Mysuru",
  "Nagpur",
  "Nalgonda",
  "Nashik",
  "Nellore",
  "New Delhi",
  "Nizamabad",
  "Noida",
  "Ongole",
  "Patna",
  "Puducherry",
  "Pune",
  "Raipur",
  "Rajamahendravaram",
  "Rajahmundry",
  "Ranchi",
  "Sangareddy",
  "Secunderabad",
  "Siddipet",
  "Srikakulam",
  "Surat",
  "Suryapet",
  "Thane",
  "Thiruvananthapuram",
  "Thrissur",
  "Tiruchirappalli",
  "Tirupati",
  "Tiruppur",
  "Udaipur",
  "Vadodara",
  "Vijayawada",
  "Visakhapatnam",
  "Vizianagaram",
  "Warangal",
].sort((a, b) => b.length - a.length);

const CITY_LOOKUP = new Map<string, string>();
for (const city of CITIES) CITY_LOOKUP.set(city.toLocaleLowerCase(), city);
for (const [alias, city] of Object.entries(CITY_ALIASES)) {
  CITY_LOOKUP.set(alias, city);
}

const MATCH_PHRASES = [...CITY_LOOKUP.keys()].sort((a, b) => b.length - a.length);

const ADDRESS_HINT =
  /\b(road|rd\.?|street|st\.?|nagar|colony|layout|cross|lane|plot|floor|opp\.?|opposite|near|dist\.?|district|pin|pincode|h\.?\s*no|door|survey|apartment|society|complex|bypass|highway|nh\s*\d)\b/i;
const PINCODE = /\b\d{6}\b/;
const STATE_OR_COUNTRY =
  /^(andhra pradesh|telangana|karnataka|tamil nadu|kerala|maharashtra|india|ap|ts)$/i;

function normalizeLocationText(value: string): string {
  return value
    .replace(/[/,;|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseCity(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLocaleLowerCase())
    .join(" ");
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const padded = ` ${haystack} `;
  const needle = ` ${phrase} `;
  return padded.includes(needle);
}

/** City for Location filter. Returns null when only a street address is present. */
export function cityNameFromLocation(location: string | null | undefined): string | null {
  const raw = (location ?? "").trim();
  if (!raw) return null;

  const normalized = normalizeLocationText(raw).toLocaleLowerCase();
  if (!normalized || STATE_OR_COUNTRY.test(normalized)) return null;

  for (const phrase of MATCH_PHRASES) {
    if (!containsPhrase(normalized, phrase)) continue;
    return CITY_LOOKUP.get(phrase) ?? titleCaseCity(phrase);
  }

  const looksLikeAddress = ADDRESS_HINT.test(raw) || PINCODE.test(raw) || (raw.includes(",") && raw.length > 40);
  if (looksLikeAddress) return null;

  const compact = normalizeLocationText(raw);
  const words = compact.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 3) return null;
  if (/\d/.test(compact)) return null;
  if (STATE_OR_COUNTRY.test(compact)) return null;
  return titleCaseCity(compact);
}

export function locationMatchesCityFilter(
  location: string | null | undefined,
  selectedCity: string,
): boolean {
  const want = selectedCity.trim().toLocaleLowerCase();
  if (!want) return true;
  const city = cityNameFromLocation(location);
  return (city ?? "").toLocaleLowerCase() === want;
}
