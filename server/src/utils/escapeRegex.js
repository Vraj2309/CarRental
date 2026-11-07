// User input must never be used as a raw regular expression.
// A search like "(a+)+$" can make the regex engine run for seconds
// (ReDoS), and "." would match everything. Escaping turns every special
// character into a literal one.
export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
