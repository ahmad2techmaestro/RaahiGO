/**
 * Retrieval for the support assistant (the "R" in RAG).
 *
 * BM25 ranking over the policy knowledge base. No embeddings and no vector database: at this
 * knowledge-base size lexical retrieval is fast, free, deterministic and easy to test. Each
 * policy is indexed by topic, keywords and content, with keywords boosted because they are
 * written to match how travellers phrase questions.
 *
 * Hinglish: a small synonym table maps common Hindi/Hinglish words ("radd", "paisa wapas") onto
 * the English terms the policies use, so "ticket radd kaise karein" finds the cancellation policy.
 *
 * Honesty: retrieval returns a confidence and an empty list when nothing is relevant, and callers
 * must answer "I don't know" in that case rather than guess.
 */
const { POLICIES } = require("./policyKB");

const K1 = 1.4;
const B = 0.72;
const KEYWORD_BOOST = 3;
// Below this BM25 score a match is treated as noise.
const MIN_SCORE = 2.4;

const STOP = new Set(
  "a an the and or but of to in on at for with from by is are was were be been it its this that these those do does did can could should would will my me i you your we our they them their what when where which who how why please tell know want need get have has had about into than then there not any all some kya hai hain ka ki ke ko se me mein par aur ya mera meri mere kaise kab kahan kyu kyun karo karna karein kar sakta sakte".split(" ")
);

const SYNONYMS = {
  radd: ["cancel", "cancellation"],
  rad: ["cancel"],
  cancelled: ["cancel"],
  canceled: ["cancel"],
  paisa: ["refund", "money"],
  paise: ["refund", "money"],
  wapas: ["refund"],
  vapas: ["refund"],
  refunds: ["refund"],
  rupay: ["refund"],
  bhugtan: ["payment"],
  payments: ["payment"],
  paid: ["payment"],
  pay: ["payment"],
  seats: ["seat"],
  seet: ["seat"],
  ticket: ["ticket", "booking"],
  tickets: ["ticket", "booking"],
  booking: ["booking", "ticket"],
  bookings: ["booking", "ticket"],
  late: ["delay"],
  delayed: ["delay"],
  deri: ["delay"],
  track: ["tracking"],
  kahan: ["tracking"],
  coupons: ["coupon"],
  offer: ["coupon", "cashback"],
  offers: ["coupon", "cashback"],
  discount: ["coupon"],
  points: ["points", "loyalty"],
  wallets: ["wallet"],
  password: ["password", "security"],
};

function tokenize(text) {
  const raw = String(text || "").toLowerCase().match(/[a-z0-9₹]+/g) || [];
  const out = [];
  for (const w of raw) {
    if (STOP.has(w) || w.length < 2) continue;
    out.push(w);
    // Light stemming so "cancelling"/"cancels" meet "cancel".
    const stem = w.replace(/(ing|ed|es|s)$/, "");
    if (stem !== w && stem.length >= 3) out.push(stem);
    if (SYNONYMS[w]) out.push(...SYNONYMS[w]);
  }
  return out;
}

function buildIndex(policies) {
  const docs = policies.map((p) => {
    const tf = new Map();
    const add = (tok, weight) => tf.set(tok, (tf.get(tok) || 0) + weight);
    tokenize(p.topic).forEach((t) => add(t, 2));
    (p.keywords || []).forEach((k) => tokenize(k).forEach((t) => add(t, KEYWORD_BOOST)));
    tokenize(p.content).forEach((t) => add(t, 1));
    let len = 0;
    tf.forEach((v) => (len += v));
    return { policy: p, tf, len };
  });
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
  const df = new Map();
  docs.forEach((d) => d.tf.forEach((_, t) => df.set(t, (df.get(t) || 0) + 1)));
  return { docs, avgLen, df, n: docs.length };
}

let cached = null;
function getIndex() {
  if (!cached) cached = buildIndex(POLICIES);
  return cached;
}

/**
 * @returns {{policy:object, score:number}[]} policies that genuinely match, best first.
 *   An empty array means "nothing relevant in the knowledge base".
 */
function retrieve(question, { limit = 3, minScore = MIN_SCORE, index = getIndex() } = {}) {
  const qTokens = [...new Set(tokenize(question))];
  if (!qTokens.length) return [];

  const scored = index.docs.map((d) => {
    let score = 0;
    for (const t of qTokens) {
      const f = d.tf.get(t);
      if (!f) continue;
      const n = index.df.get(t) || 0;
      const idf = Math.log(1 + (index.n - n + 0.5) / (n + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / index.avgLen)));
    }
    return { policy: d.policy, score: Number(score.toFixed(3)) };
  });

  return scored
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** 0–1 confidence from the best score, so the UI can say how sure the answer is. */
function confidenceOf(results) {
  if (!results.length) return 0;
  return Math.min(1, Number((results[0].score / (MIN_SCORE * 4)).toFixed(2)));
}

module.exports = { retrieve, confidenceOf, tokenize, buildIndex, MIN_SCORE };
