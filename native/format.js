/*
 * display/format - Turns a message value into the text to show
 *
 *   "text"      strings as they are, a Date as "YYYY-MM-DD HH:MM:SS",
 *               anything else with String()
 *   "time"      "HH:MM:SS"
 *   "hm"        "HH:MM"
 *   "date"      "YYYY-MM-DD"
 *   "datetime"  "YYYY-MM-DD HH:MM:SS"
 * The time formats take a Date, milliseconds since 1970 (the inject node's
 * timestamp, Date.now()) or a date string, in the device's local time.
 * A value that is not a valid date is shown with String().
 */

export const FORMATS = Object.freeze(["text", "time", "hm", "date", "datetime"]);

function two(n) {
    return (n < 10) ? "0" + n : String(n);
}

function toDate(value) {
    if (value instanceof Date)
        return value;
    if (("number" === typeof value) || ("string" === typeof value))
        return new Date(("string" === typeof value) && /^\d+$/.test(value.trim()) ? Number(value) : value);
}

function date(d) {
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

function time(d, seconds) {
    const hm = `${two(d.getHours())}:${two(d.getMinutes())}`;
    return seconds ? `${hm}:${two(d.getSeconds())}` : hm;
}

export function format(value, kind = "text") {
    if (undefined === value)
        return "";
    if (!FORMATS.includes(kind) || ("text" === kind)) {
        if (value instanceof Date)
            kind = "datetime";
        else
            return String(value);
    }
    const d = toDate(value);
    if (!d || isNaN(d.getTime()))
        return String(value);
    switch (kind) {
        case "time":
            return time(d, true);
        case "hm":
            return time(d, false);
        case "date":
            return date(d);
        default:
            return `${date(d)} ${time(d, true)}`;
    }
}

export default format;
