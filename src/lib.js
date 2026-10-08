// Pure helpers shared by the content script and the Node tests.
const HFX = (() => {
  const UNITS = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  const DAY_MS = 24 * 60 * 60 * 1000;

  // "8B", "500m", "1.5e9", "1,000,000" -> integer. Empty -> null, garbage -> NaN.
  function parseSize(text) {
    const cleaned = String(text ?? '').replace(/[\s,_]/g, '');
    if (cleaned === '') return null;
    const match = /^(\d*\.?\d+(?:e\+?\d+)?)([kmbt])?$/i.exec(cleaned);
    if (!match) return NaN;
    const value = Number(match[1]) * (match[2] ? UNITS[match[2].toUpperCase()] : 1);
    return Number.isFinite(value) ? Math.round(value) : NaN;
  }

  // Shortest form that round-trips exactly: 8000000000 -> "8B", 123456789 -> "123456789".
  function formatSize(n) {
    for (const unit of ['T', 'B', 'M', 'K']) {
      const scaled = Math.round((n / UNITS[unit]) * 1000) / 1000;
      const natural = scaled >= 1 && (scaled < 1000 || unit === 'T');
      if (natural && Math.round(scaled * UNITS[unit]) === n) return `${scaled}${unit}`;
    }
    return String(n);
  }

  // Reads HF's own `num_parameters=min:0,max:8B` query parameter.
  function readParamRange(search) {
    const range = { min: null, max: null };
    const raw = new URLSearchParams(search).get('num_parameters') ?? '';
    for (const token of raw.split(',')) {
      const [key, value] = token.split(':');
      if (key !== 'min' && key !== 'max') continue;
      const parsed = parseSize(value);
      if (parsed !== null && !Number.isNaN(parsed)) range[key] = parsed;
    }
    return range;
  }

  // Returns the query string with the range applied and pagination reset.
  function writeParamRange(search, { min, max }) {
    const params = new URLSearchParams(search);
    params.delete('p');
    const tokens = [];
    if (min != null) tokens.push(`min:${formatSize(min)}`);
    if (max != null) tokens.push(`max:${formatSize(max)}`);
    if (tokens.length) params.set('num_parameters', tokens.join(','));
    else params.delete('num_parameters');
    const query = params.toString().replace(/%3A/gi, ':').replace(/%2C/gi, ',');
    return query ? `?${query}` : '';
  }

  // Turns the raw form values into something `matches` can use.
  function compileFilters(raw) {
    const numberOrNull = (parse, text) => {
      const value = parse(text);
      return value === null || Number.isNaN(value) ? null : value;
    };
    const filters = {
      minDownloads: numberOrNull(parseSize, raw.minDownloads),
      minLikes: numberOrNull(parseSize, raw.minLikes),
      maxAgeDays: numberOrNull(parseSize, raw.maxAgeDays),
      hideGated: Boolean(raw.hideGated),
      exclude: String(raw.exclude ?? '')
        .split(',')
        .map((term) => term.trim().toLowerCase())
        .filter(Boolean),
    };
    // Everything except `exclude` needs the model's metadata, not just its id.
    filters.needsData =
      filters.minDownloads !== null ||
      filters.minLikes !== null ||
      filters.maxAgeDays !== null ||
      filters.hideGated;
    filters.active = filters.needsData || filters.exclude.length > 0;
    return filters;
  }

  // A field the model doesn't have never hides it.
  function matches(model, filters, now = Date.now()) {
    if (filters.minDownloads !== null && model.downloads < filters.minDownloads) return false;
    if (filters.minLikes !== null && model.likes < filters.minLikes) return false;
    if (filters.maxAgeDays !== null && model.lastModified) {
      if (now - Date.parse(model.lastModified) > filters.maxAgeDays * DAY_MS) return false;
    }
    if (filters.hideGated && model.gated) return false;
    const id = String(model.id ?? '').toLowerCase();
    if (filters.exclude.some((term) => id.includes(term))) return false;
    return true;
  }

  return { parseSize, formatSize, readParamRange, writeParamRange, compileFilters, matches };
})();

if (typeof module !== 'undefined') module.exports = HFX;
