// Finds a date/time inside a note, e.g. "call Ahmed tomorrow at 5pm".
// English only. Pure function, no network, nothing is stored.
(function (root) {
  'use strict';
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const PART_H = { morning: 8, afternoon: 15, evening: 18, night: 20 };

  function parseTime(raw, nowIn) {
    const now = nowIn || new Date();
    let s = ' ' + String(raw || '') + ' ';
    let found = false;
    const cut = re => { const m = re.exec(s); if (m) { s = s.replace(re, ' '); found = true; } return m; };
    const day0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

    let date = null, defH = null, h = null, mi = 0, ampm = null, part = null, relMs = null;

    // in 2 hours / in 30 min / in an hour / in half an hour / in 3 days
    let m = cut(/\bin\s+(half an|an?|\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|h|days?)\b/i);
    if (m) {
      const n = /^half/i.test(m[1]) ? 0.5 : /^an?$/i.test(m[1]) ? 1 : parseFloat(m[1]);
      const u = m[2][0].toLowerCase();
      if (u === 'm') relMs = n * 60e3;
      else if (u === 'h') relMs = n * 3600e3;
      else { date = addDays(day0(now), Math.round(n)); defH = 9; }
    }

    if (cut(/\btomorrow\b/i)) { date = addDays(day0(now), 1); defH = 8; }

    m = cut(/\b(?:this\s+|in the\s+|at\s+)?(morning|afternoon|evening|tonight|night)\b/i);
    if (m) {
      const w = m[1].toLowerCase();
      part = w === 'tonight' ? 'night' : w;
      if (!date && /tonight|this/i.test(m[0])) date = day0(now);
    }

    if (cut(/\btoday\b/i)) { if (!date) date = day0(now); if (defH === null) defH = 18; }

    if (cut(/\b(?:this\s+)?weekend\b/i)) {
      if (!date) date = addDays(day0(now), ((6 - now.getDay() + 7) % 7) || 7);
      defH = 10;
    }

    m = cut(new RegExp('\\b(?:(?:on|next|this|coming)\\s+)?(' + DAYS.join('|') + ')\\b', 'i'));
    let sameWeekday = false;
    if (m && !date) {
      const idx = DAYS.indexOf(m[1].toLowerCase());
      sameWeekday = idx === now.getDay() && !/next/i.test(m[0]);
      date = sameWeekday ? day0(now) : addDays(day0(now), ((idx - now.getDay() + 7) % 7) || 7);
      defH = 9;
    }

    // explicit time
    m = cut(/\b(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?(?![a-z])/i);
    if (m) { h = +m[1]; mi = +m[2]; ampm = m[3] || null; }
    else if ((m = cut(/\b(?:at\s+)?(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)(?![a-z])/i))) { h = +m[1]; ampm = m[2]; }
    else if ((m = cut(/\bat\s+(\d{1,2})(?:\s*o'?clock)?(?![\d:])/i))) { h = +m[1]; }
    else if (cut(/\bnoon\b/i)) { h = 12; ampm = 'pm'; }

    let ambiguous = false;
    if (h !== null) {
      if (h > 23 || mi > 59) { h = null; mi = 0; }
      else if (ampm) {
        h = (h % 12) + (ampm[0].toLowerCase() === 'p' ? 12 : 0);
      } else if (h >= 1 && h <= 12) {
        if (part === 'evening' || part === 'night' || part === 'afternoon') { if (h < 12) h += 12; }
        else if (part === 'morning') { /* keep as am */ }
        else if (h <= 7) { h += 12; }
        else { ambiguous = true; } // 8-12: assume am/noon, may flip to pm below
      }
    }

    if (!found) return null;

    let when;
    if (relMs !== null) {
      when = new Date(now.getTime() + relMs);
    } else {
      const hasDate = date !== null;
      const base = date || day0(now);
      let hh, mm = 0;
      if (h !== null) { hh = h; mm = mi; }
      else if (part) { hh = PART_H[part]; }
      else if (defH !== null) { hh = defH; }
      else { hh = 9; }
      when = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh, mm);
      if (when.getTime() < now.getTime() + 60000) {
        if (!hasDate) {
          const alt = new Date(when.getTime() + 12 * 3600e3);
          if (ambiguous && alt.getTime() > now.getTime() + 60000 && alt.getDate() === when.getDate()) when = alt;
          else when = new Date(when.getFullYear(), when.getMonth(), when.getDate() + 1, hh, mm);
        } else if (sameWeekday) {
          when = new Date(when.getFullYear(), when.getMonth(), when.getDate() + 7, when.getHours(), when.getMinutes());
        } else if (date.getTime() === day0(now).getTime()) {
          when = new Date(now.getTime() + 3600e3); // "today"/"tonight" already passed
        }
      }
    }

    let title = s.replace(/\s+/g, ' ').trim();
    title = title.replace(/^(?:please\s+)?remind me\s+(?:to\s+)?/i, '').trim();
    title = title.replace(/(?:\s+(?:at|on|by|in|for|until|before|this|next))+$/i, '').trim();
    title = title.replace(/^(?:at|on|by|in|for|until)\s+/i, '').trim();
    title = title.replace(/[\s,;.\-–]+$/, '').trim();
    if (!title) title = String(raw).trim();
    title = title.charAt(0).toUpperCase() + title.slice(1);
    return { when, title };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { parseTime };
  else root.parseTime = parseTime;
})(typeof window !== 'undefined' ? window : this);
