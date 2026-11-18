// Request-time open status computed from cached opening-hours periods.
// Asia/Taipei is a fixed UTC+8 offset with no daylight saving, so the local wall
// clock is derived straight from the UTC epoch (no timezone database needed).
const TZ_OFFSET_MINUTES = 480;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const WEEK_MS = 7 * DAY_MS;

const DAY_ENUM_TO_NUMBER = {
  DAY_0_SUNDAY: 0,
  DAY_1_MONDAY: 1,
  DAY_2_TUESDAY: 2,
  DAY_3_WEDNESDAY: 3,
  DAY_4_THURSDAY: 4,
  DAY_5_FRIDAY: 5,
  DAY_6_SATURDAY: 6,
};

function normalizeDay(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const day = Math.trunc(raw);
    return day >= 0 && day <= 6 ? day : null;
  }
  if (typeof raw === 'string') {
    if (Object.prototype.hasOwnProperty.call(DAY_ENUM_TO_NUMBER, raw)) {
      return DAY_ENUM_TO_NUMBER[raw];
    }
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber)) {
      const day = Math.trunc(asNumber);
      return day >= 0 && day <= 6 ? day : null;
    }
  }
  return null;
}

function normalizePoint(point) {
  if (!point || typeof point !== 'object') return null;
  const day = normalizeDay(point.day);
  const hour = Number(point.hour);
  const minute = Number(point.minute ?? 0);
  if (day === null) return null;
  if (!Number.isFinite(hour) || hour < 0 || hour > 24) return null;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  return { day, hour: Math.trunc(hour), minute: Math.trunc(minute) };
}

// Keeps only what the scheduler needs from Google's currentOpeningHours.
// null = no periods data (caller falls back to the cached openNow snapshot);
// [] = Google says the place never opens.
function compactOpeningPeriods(currentOpeningHours) {
  if (!currentOpeningHours || typeof currentOpeningHours !== 'object') return null;
  if (!Array.isArray(currentOpeningHours.periods)) return null;
  const compacted = [];
  for (const period of currentOpeningHours.periods) {
    const open = normalizePoint(period && period.open);
    if (!open) continue;
    const close = normalizePoint(period && period.close);
    compacted.push({
      open: { day: open.day, hour: open.hour, minute: open.minute },
      close: close ? { day: close.day, hour: close.hour, minute: close.minute } : null,
    });
  }
  return compacted;
}

// Half-open interval [open, close) containing now in the place-local week.
// The -1/0/+1 week shifts cover schedules whose anchor day is not today, e.g. a
// 24/7 period captured on the previous day, and hours that cross midnight.
function isOpenAt(periods, nowMs) {
  const now = nowMs + TZ_OFFSET_MINUTES * MINUTE_MS;
  const local = new Date(now);
  const todayDay = local.getUTCDay();
  const midnightMs = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  for (const period of periods) {
    const open = normalizePoint(period && period.open);
    if (!open) continue;
    const openMinutes = open.hour * 60 + open.minute;
    let durationMinutes = 24 * 60;
    const close = normalizePoint(period && period.close);
    if (close) {
      durationMinutes =
        ((close.day - open.day + 7) % 7) * 1440 + (close.hour * 60 + close.minute - openMinutes);
      if (durationMinutes <= 0) durationMinutes += 1440;
      if (durationMinutes > 2 * 1440) durationMinutes = 1440;
    }
    for (let shift = -1; shift <= 1; shift++) {
      const openAt = midnightMs + (open.day - todayDay) * DAY_MS + openMinutes * MINUTE_MS + shift * WEEK_MS;
      if (now >= openAt && now < openAt + durationMinutes * MINUTE_MS) return true;
    }
  }
  return false;
}

// 'schedule' = recomputed from periods at request time; 'snapshot' = the cached
// openNow captured at fetch time; null = no opening-hours data at all.
function resolveOpenStatus(restaurant, nowMs) {
  const periods = restaurant && restaurant.openingPeriods;
  if (Array.isArray(periods)) {
    if (periods.length === 0) return { isOpen: false, isOpenBasis: 'schedule' };
    return { isOpen: isOpenAt(periods, nowMs), isOpenBasis: 'schedule' };
  }
  const snapshot = restaurant && restaurant.isOpen;
  if (typeof snapshot === 'boolean') return { isOpen: snapshot, isOpenBasis: 'snapshot' };
  return { isOpen: null, isOpenBasis: null };
}

module.exports = { TZ_OFFSET_MINUTES, compactOpeningPeriods, isOpenAt, resolveOpenStatus };
