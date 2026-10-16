export const TEAM_WORK_STATUS = Object.freeze({
  AWAY: 'Away',
  ON_SHIFT: 'On Shift',
  OFF_SHIFT: 'Off Shift',
  UNKNOWN: 'Unknown',
});

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const OFFSET_TIMESTAMP = /(?:Z|[+-][0-9]{2}:[0-9]{2})$/i;

function timestamp(value) {
  if (typeof value !== 'string' || !OFFSET_TIMESTAMP.test(value)) return NaN;
  return Date.parse(value);
}

function dateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value ? value : '';
}

function previousDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function localClock(now, timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return null;
  try {
    const offsetFormatter = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' });
    const offset = value => offsetFormatter.formatToParts(value).find(part => part.type === 'timeZoneName')?.value;
    const currentOffset = offset(now);
    if (!currentOffset || currentOffset !== offset(new Date(now.valueOf() - 86400000))
      || currentOffset !== offset(new Date(now.valueOf() + 86400000))) return null;
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map(part => [part.type, part.value]));
    const day = dateKey(`${parts.year}-${parts.month}-${parts.day}`);
    if (!day) return null;
    return { day, seconds: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second) };
  } catch { return null; }
}

function leaveState(request, nowMs) {
  const status = request?.status;
  if (status === 'submitted' || status === 'denied') return null;
  const start = timestamp(request?.starts_at);
  const stop = timestamp(request?.stops_at);
  if (!Number.isFinite(start) || !Number.isFinite(stop) || stop <= start) return TEAM_WORK_STATUS.UNKNOWN;
  if (nowMs < start || nowMs >= stop) return null;
  if (status !== 'approved') return TEAM_WORK_STATUS.UNKNOWN;
  if (!Array.isArray(request.time_off_request_days)) return TEAM_WORK_STATUS.UNKNOWN;
  let uncertain = false;
  for (const day of request.time_off_request_days) {
    if (!Number.isFinite(Number(day?.amount_used)) || Number(day.amount_used) < 0) {
      uncertain = true;
      continue;
    }
    if (Number(day.amount_used) === 0) continue;
    const dayStart = timestamp(day.starts_at);
    const dayStop = timestamp(day.stops_at);
    if (!Number.isFinite(dayStart) || !Number.isFinite(dayStop) || dayStop <= dayStart) {
      uncertain = true;
      continue;
    }
    if (nowMs >= dayStart && nowMs < dayStop) return TEAM_WORK_STATUS.AWAY;
  }
  return uncertain ? TEAM_WORK_STATUS.UNKNOWN : null;
}

function scheduleState(schedule, clock) {
  if (schedule?.use_time_zone !== 'user' || schedule?.repeat_schedule !== 'weekly'
    || !dateKey(schedule.start_date)
    || (schedule.repeat_until != null && !dateKey(schedule.repeat_until))
    || !Array.isArray(schedule.weekdays) || !schedule.weekdays.length
    || schedule.weekdays.some(day => !WEEKDAYS.includes(day))
    || !Array.isArray(schedule.excluded_dates)
    || schedule.excluded_dates.some(day => !dateKey(day))) return null;
  const startParts = typeof schedule.start_time === 'string'
    ? /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(schedule.start_time) : null;
  const duration = Number(schedule.duration);
  if (!startParts || !Number.isFinite(duration) || duration <= 0 || duration > 86400) return null;
  if (schedule.start_date > clock.day || (schedule.repeat_until && schedule.repeat_until < previousDate(clock.day))) return null;
  const startSeconds = Number(startParts[1]) * 3600 + Number(startParts[2]) * 60 + Number(startParts[3] || 0);
  for (const [day, elapsedDaySeconds] of [[clock.day, 0], [previousDate(clock.day), 86400]]) {
    if (day < schedule.start_date || (schedule.repeat_until && day > schedule.repeat_until)
      || schedule.excluded_dates.includes(day)) continue;
    const weekday = WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()];
    if (!schedule.weekdays.includes(weekday)) continue;
    const seconds = clock.seconds + elapsedDaySeconds;
    if (seconds >= startSeconds && seconds < startSeconds + duration) return true;
  }
  return false;
}

export function deriveTeamWorkStatus({ requests = [], schedules = [], timeZone, now = new Date(), complete = false }) {
  if (!complete || !Array.isArray(requests) || !Array.isArray(schedules)
    || !(now instanceof Date) || !Number.isFinite(now.valueOf())) return TEAM_WORK_STATUS.UNKNOWN;
  let uncertainLeave = false;
  for (const request of requests) {
    const state = leaveState(request, now.valueOf());
    if (state === TEAM_WORK_STATUS.AWAY) return state;
    if (state === TEAM_WORK_STATUS.UNKNOWN) uncertainLeave = true;
  }
  if (uncertainLeave) return TEAM_WORK_STATUS.UNKNOWN;
  const clock = localClock(now, timeZone);
  if (!clock || !schedules.length) return TEAM_WORK_STATUS.UNKNOWN;
  let validSchedule = false;
  for (const schedule of schedules) {
    const state = scheduleState(schedule, clock);
    if (state === true) return TEAM_WORK_STATUS.ON_SHIFT;
    if (state === false) validSchedule = true;
    else return TEAM_WORK_STATUS.UNKNOWN;
  }
  return validSchedule ? TEAM_WORK_STATUS.OFF_SHIFT : TEAM_WORK_STATUS.UNKNOWN;
}
