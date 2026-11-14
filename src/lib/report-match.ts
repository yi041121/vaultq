// Heuristic lost/found matching used by the admin report review screen.
// Pure functions with no dependencies so the scoring stays explainable and
// easy to unit test.

export interface LostReportDetails {
  itemName: string;
  category?: string | null;
  description?: string | null;
  location?: string | null;
  date?: string | null;
}

export interface MatchCandidate {
  id: string;
  itemName: string;
  category?: string | null;
  description?: string | null;
  foundLocation?: string | null;
  foundDate?: string | null;
}

export interface MatchSuggestion {
  itemId: string;
  score: number;
  reasons: string[];
}

/** Minimum score before a candidate is worth showing to an admin. */
export const SUGGESTION_THRESHOLD = 40;

const STOPWORDS = new Set([
  "a", "an", "and", "at", "for", "from", "in", "is", "my", "of", "on", "or", "the", "to", "with",
  "item", "lost", "found", "it", "has", "have", "this", "that", "was", "its",
]);

// Small, explicit vocabulary rather than broad stemming (e.g. notebook is not
// always a laptop). Used by students, admin suggestions and notifications alike.
const SYNONYMS: Record<string, string> = {
  backpack: "bag", backpacks: "bag", rucksack: "bag", rucksacks: "bag", bags: "bag",
  cellphone: "phone", cellphones: "phone", smartphone: "phone", smartphones: "phone", phones: "phone",
  bottles: "bottle", waterbottle: "bottle", keys: "key", wallets: "wallet",
  laptops: "laptop", grey: "gray",
};
const GENERIC_NAME_TOKENS = new Set([
  "black", "white", "blue", "red", "green", "yellow", "pink", "purple", "gray", "brown", "orange",
  "small", "large", "new", "old",
]);

function tokens(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
    .map((token) => Object.hasOwn(SYNONYMS, token) ? SYNONYMS[token] : token);
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** 0..1 similarity between two item names, with a bonus when one contains the other. */
function nameSimilarity(a: string, b: string): number {
  const tokensA = tokens(a);
  const tokensB = tokens(b);
  if (!tokensA.length || !tokensB.length) return 0;

  const joinedA = tokensA.join(" ");
  const joinedB = tokensB.join(" ");
  const contains = ` ${joinedA} `.includes(` ${joinedB} `) || ` ${joinedB} `.includes(` ${joinedA} `);
  return Math.min(1, jaccard(tokensA, tokensB) + (contains ? 0.35 : 0));
}

/** Parses a yyyy-mm-dd (or ISO) value into a UTC day number. */
function dayNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const iso = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const time = Date.parse(`${iso}T00:00:00.000Z`);
  return Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== iso
    ? null : Math.round(time / 86_400_000);
}

function datePoints(lostDate?: string | null, foundDate?: string | null): { points: number; reason: string | null } {
  const lost = dayNumber(lostDate);
  const found = dayNumber(foundDate);
  if (lost === null || found === null) return { points: 0, reason: null };

  const days = found - lost;
  if (days < 0) return { points: 0, reason: null };
  if (days <= 1) return { points: 12, reason: "Found within a day of the lost date" };
  if (days <= 3) return { points: 10, reason: `Found ${days} days after the lost date` };
  if (days <= 7) return { points: 6, reason: "Found within a week of the lost date" };
  if (days <= 30) return { points: 3, reason: "Found within a month of the lost date" };
  return { points: 0, reason: null };
}

/**
 * Scores candidate found items against a lost report.
 * Weights: name 50, category 15, description 15, date proximity 12, location 8.
 * A shared item-name term or multiple descriptive details are required first:
 * category/date/location alone must never trigger an ownership suggestion.
 * Scores express similarity, not a probability of ownership.
 */
export function suggestMatches(
  report: LostReportDetails,
  candidates: MatchCandidate[],
  options: { excludeItemId?: string | null; limit?: number } = {},
): MatchSuggestion[] {
  const limit = options.limit ?? 5;
  if (limit <= 0) return [];
  const reportCategory = report.category || null;
  const reportLocation = tokens(report.location);
  const reportName = tokens(report.itemName);
  const reportDetails = tokens(report.description);

  return candidates
    .filter((candidate) => candidate.id !== options.excludeItemId)
    .filter((candidate) => {
      const candidateName = new Set(tokens(candidate.itemName));
      if (reportName.some((token) => !GENERIC_NAME_TOKENS.has(token) && candidateName.has(token))) return true;
      const candidateDetails = tokens(candidate.description);
      const detailSet = new Set(candidateDetails);
      const sharedDetails = new Set(reportDetails.filter((token) => !GENERIC_NAME_TOKENS.has(token) && detailSet.has(token)));
      return sharedDetails.size >= 2 && jaccard(reportDetails, candidateDetails) >= 0.4;
    })
    .map((candidate) => {
      const reasons: string[] = [];
      const name = nameSimilarity(report.itemName, candidate.itemName);
      if (name >= 0.5) reasons.push("Similar name");

      const categoryPoints =
        reportCategory && candidate.category
          ? reportCategory === candidate.category
            ? 15
            : 0
          : 5;
      if (categoryPoints === 15) reasons.push("Same category");

      const description = jaccard(reportDetails, tokens(candidate.description));
      if (description >= 0.3) reasons.push("Similar identifying details");

      const date = datePoints(report.date, candidate.foundDate);
      if (date.reason) reasons.push(date.reason);

      const locationOverlap = jaccard(reportLocation, tokens(candidate.foundLocation));
      const locationPoints = Math.round(locationOverlap * 8);
      if (locationOverlap >= 0.4) reasons.push("Similar location");

      const score = Math.min(
        100,
        Math.round(name * 50) + categoryPoints + Math.round(description * 15) + date.points + locationPoints,
      );

      return {
        itemId: candidate.id,
        score,
        reasons: reasons.length ? reasons : ["Possible match"],
      };
    })
    .filter((suggestion) => suggestion.score >= SUGGESTION_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId))
    .slice(0, limit);
}

/** Label used by the score chip in the admin UI. */
export function suggestionLabel(score: number): "Strong" | "Possible" | "Weak" {
  if (score >= 70) return "Strong";
  if (score >= 50) return "Possible";
  return "Weak";
}
