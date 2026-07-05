// Parses a stored pickup/scheduled time string into 24-hour hours+minutes.
//
// The database stores these as free-form text and the formats are mixed:
//   "9:00 AM", "10:30 AM", "06:30 AM", "7:00 AM"  (12-hour with meridiem)
//   "07:00"                                         (24-hour, no meridiem)
//
// Naive `str.split(':').map(Number)` breaks on the 12-hour rows: the minutes
// field becomes "45 AM" -> NaN, which silently disables any time comparison
// built on top of it (a NaN date compares false against everything). Both the
// clock-in "too early" guard on the client and the server relied on that naive
// parse, so early clock-ins slipped through. This is the single source of truth
// for turning a stored time string into real hours/minutes.
export function parsePickupTime(
  raw: string | null | undefined,
): { hours: number; minutes: number } | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  const match = s.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (minutes < 0 || minutes > 59) return null;

  const meridiem = match[3]?.toUpperCase();
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  }
  if (hours < 0 || hours > 23) return null;

  return { hours, minutes };
}
