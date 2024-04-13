/** Represents minutes past midnight. */
type Time = number;

type Span = [ start: Time, end: Time ];


function readSpan(start: string, end: string): Span {
    return [readTime(start), readTime(end)];
}

function readTime(time: string): Time {
    const match = time.match(/(\d+):(\d+)/);
    if (match) {
        const [, hours, minutes] = match;
        return parseInt(hours) * 60 + parseInt(minutes);
    } else {
        return NaN;
    }
}

function getSpanMins(span: Span): number {
    const [start, end] = span;
    const wrapsDay = end < start;
    return end + (wrapsDay ? 24 * 60 : 0) - start;
}

function createDateSpan(date: Date, start: Time, end: Time): [Date, Date] {
    const startDate = new Date(date);
    setDateToMidnight(startDate);
    startDate.setMinutes(start);

    const wrapsDay = end < start;
    const endDate = wrapsDay ? getTomorrow(date) : new Date(date);
    setDateToMidnight(endDate);
    endDate.setMinutes(end);

    return [startDate, endDate];
}

function setDateToMidnight(date: Date) {
    date.setHours(0);
    date.setMinutes(0);
    date.setSeconds(0);
    date.setMilliseconds(0);
}

function getTomorrow(today: Date) {
    const date = new Date(today);
    date.setTime(date.getTime() + 24 * 60 * 60 * 1000);
    return date;
}