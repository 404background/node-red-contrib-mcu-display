/*
 * Runs the MCU modules (lib/font.js, lib/format.js, lib/screen.js, lib/ssd1306.js)
 * on Node.js with a mock I2C bus: npm test
 *   --show  prints the test screens as text
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/* The modules import each other by their manifest names: copy them with file imports */
const lib = fileURLToPath(new URL("../../lib/", import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcu-display-"));
for (const name of ["font", "format", "screen", "ssd1306"]) {
    const source = fs.readFileSync(path.join(lib, `${name}.js`), "utf8")
        .replace(/from "display\/(\w+)"/g, (_, module) => `from "./${module}.mjs"`);
    fs.writeFileSync(path.join(dir, `${name}.mjs`), source);
}
const load = (name) => import(pathToFileURL(path.join(dir, `${name}.mjs`)).href);
const { glyph, symbols } = await load("font");
const { default: Screen } = await load("screen");
const { default: SSD1306 } = await load("ssd1306");
const { format } = await load("format");
const show = process.argv.includes("--show");

function text(screen) {
    let out = "";
    for (let y = 0; y < screen.height; y++) {
        for (let x = 0; x < screen.width; x++)
            out += screen.pixel(x, y) ? "#" : ".";
        out += "\n";
    }
    return out;
}
function rows(screen, y0, y1, x1 = screen.width) {
    return text(screen).split("\n").slice(y0, y1).map(row => row.slice(0, x1));
}

/* font */
for (let c = 0x20; c < 0x7F; c++)
    assert.equal(glyph(String.fromCharCode(c))?.length, 5, `glyph of ${String.fromCharCode(c)}`);
for (const char of symbols)
    assert.equal(glyph(char)?.length, 5, `glyph of ${char}`);
assert.ok(symbols.includes("°") && symbols.includes("→") && symbols.includes("♥"));
assert.equal(glyph("あ"), undefined);
assert.equal(glyph("ab"), undefined);
/* glyphs fit in 7 rows */
for (let c = 0x20; c < 0x7F; c++)
    assert.ok(glyph(String.fromCharCode(c)).every(column => column < 0x80));

/* screen: text at a line, size 1 */
let screen = new Screen(128, 64);
assert.equal(screen.takeDirty(), 0xFF, "a new screen is sent whole");
let result = screen.print("Hi", { y: 8 });
assert.deepEqual(result, { lines: ["Hi"], height: 8, skipped: "", overflow: false });
assert.equal(screen.takeDirty(), 0x02, "only page 1 changed");
assert.deepEqual(rows(screen, 8, 15, 12), [
    "#...#...#...",
    "#...#.......",
    "#...#..##...",
    "#####...#...",
    "#...#...#...",
    "#...#...#...",
    "#...#..###..",
]);
assert.ok(rows(screen, 0, 8).every(row => !row.includes("#")), "line 1 untouched");
if (show) console.log(text(screen));

/* clear "area" replaces the node's own lines only */
screen.print("top", { y: 0 });
screen.print("x", { y: 8 });
assert.equal(screen.pixel(6, 8), 0, "old text of line 2 cleared");
assert.ok(rows(screen, 0, 7).some(row => row.includes("#")), "line 1 kept");
screen.print("", { y: 8 });
assert.ok(rows(screen, 8, 16).every(row => !row.includes("#")), "empty text clears its line");
/* clear "none" draws over */
screen.print("I", { y: 0, clear: "none" });
assert.ok(rows(screen, 0, 7).join("").length > 0);
/* clear "all" */
screen.print("A", { y: 24, clear: "all" });
assert.ok(rows(screen, 0, 24).every(row => !row.includes("#")));
assert.ok(rows(screen, 24, 31).some(row => row.includes("#")));

/* size 2: 12 x 16 cell, alignment */
screen = new Screen(128, 32);
result = screen.print("88", { size: 2, align: "right" });
assert.equal(result.height, 16);
const textWidth = 2 * 12 - 2;   // last blank column not counted
for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 128 - textWidth; x++)
        assert.equal(screen.pixel(x, y), 0, `nothing left of right aligned text (${x}, ${y})`);
}
assert.equal(screen.pixel(127, 2), 1, "right aligned text ends at the edge");
screen.print("88", { size: 2, align: "center" });
const left = Math.floor((128 - textWidth) / 2);
assert.equal(screen.pixel(left + 2, 0), 1, "centered");
assert.equal(screen.pixel(left - 1, 2), 0);

/* wrapping: 21 characters per line at size 1 */
screen = new Screen(128, 64);
result = screen.print("abcdefghijklmnopqrstuvwxyz");
assert.deepEqual(result.lines, ["abcdefghijklmnopqrstu", "vwxyz"]);
assert.equal(result.height, 16);
result = screen.print("abcdefghijklmnopqrstuvwxyz", { wrap: false });
assert.deepEqual(result.lines, ["abcdefghijklmnopqrstu"]);
result = screen.print("one\ntwo\r\nthree");
assert.deepEqual(result.lines, ["one", "two", "three"]);

/* scroll: a long line is one ticker line that moves left and repeats */
const ticker = "abcdefghijklmnopqrstuvwxyz";
screen = new Screen(128, 64);
result = screen.print(ticker, { y: 8, scroll: 0 });
assert.deepEqual(result.lines, [ticker], "not wrapped");
assert.equal(result.height, 8);
assert.equal(result.overflow, true);
const first = rows(screen, 8, 16);
screen.print("a", { y: 8 });
assert.deepEqual(rows(screen, 8, 16, 6), first.map(row => row.slice(0, 6)), "starts at the left like plain text");
screen.print(ticker, { y: 8, scroll: 6 });
screen.print("b", { y: 0, clear: "none" });
assert.deepEqual(rows(screen, 8, 16, 6), rows(screen, 0, 8, 6), "6 pixels later the second character is first");
screen.print(ticker, { y: 8, scroll: (ticker.length + 4) * 6 });
assert.deepEqual(rows(screen, 8, 16), first, "repeats after the text and a 4 character gap");
assert.equal(screen.print("short", { y: 16, scroll: 30 }).overflow, false, "a line that fits does not scroll");
screen = new Screen(128, 64);
screen.print(ticker, { x: 20, y: 0, scroll: 9 });
assert.ok(rows(screen, 0, 8, 20).every(row => !row.includes("#")), "clipped to x");
screen = new Screen(128, 64);
screen.takeDirty();
screen.print(ticker, { y: 24, scroll: 2 });
assert.equal(screen.takeDirty(), 1 << 3, "a scroll step changes only its own page");

/* scrollUp: wrapped text taller than the space to the bottom moves up and repeats */
const story = "line1\nline2\nline3\nline4\nline5";
screen = new Screen(128, 32);
result = screen.print(story, { y: 8, scrollUp: 0 });
assert.equal(result.overflow, true);
assert.equal(result.height, 40);
const upStart = rows(screen, 8, 32);
const reference = new Screen(128, 64);
reference.print(story, { y: 8 });
assert.deepEqual(upStart, rows(reference, 8, 32), "starts like plain text, cut at the bottom");
screen.print(story, { y: 8, scrollUp: 8 });
reference.print(story, { y: 0, clear: "all" });
assert.deepEqual(rows(screen, 8, 32), rows(reference, 8, 32), "8 pixels later line 2 is at the top");
assert.ok(rows(screen, 0, 8).every(row => !row.includes("#")), "clipped to y");
screen.print(story, { y: 8, scrollUp: 48 });
assert.deepEqual(rows(screen, 8, 32), upStart, "repeats after the text and a blank line");
assert.equal(new Screen(128, 64).print("short", { y: 8, scrollUp: 5 }).overflow, false, "text that fits does not scroll");
screen = new Screen(128, 64);
result = screen.print("abcdefghijklmnopqrstuvwxyz".repeat(3), { y: 48, scrollUp: 0 });
assert.equal(result.lines.length, 4, "wraps before scrolling up");
assert.equal(result.overflow, true);

/* characters not in the font */
result = screen.print("Aあ°C");
assert.equal(result.skipped, "あ");
assert.deepEqual(result.lines, ["Aあ°C"]);

/* invert: light band, dark text */
screen = new Screen(128, 32);
screen.print("I", { y: 8, invert: true });
assert.equal(screen.pixel(100, 8), 1, "background set");
assert.equal(screen.pixel(2, 8), 0, "glyph cleared");
assert.equal(screen.pixel(100, 0), 0, "outside the band");

/* fill clips to the screen and marks the pages */
screen = new Screen(128, 64);
screen.takeDirty();
screen.fill(-10, 6, 1000, 4, true);
assert.equal(screen.takeDirty(), 0x03);
assert.equal(screen.page(0)[0], 0xC0);
assert.equal(screen.page(1)[127], 0x03);

/* ssd1306 with a mock I2C bus */
class MockI2C {
    static writes = [];
    static fail = false;
    constructor(options) {
        if (MockI2C.fail)
            throw new Error("NACK");
        this.options = options;
    }
    write(buffer) {
        MockI2C.writes.push(Array.from(buffer));
    }
    close() {
        MockI2C.closed = true;
    }
}

const options = { controller: "ssd1315", width: 128, height: 64, address: 0x3C, data: 21, clock: 22, hz: 400000, io: MockI2C };
const panel = new SSD1306(options);
panel.open();
const init = MockI2C.writes.shift();
assert.equal(init[0], 0x00, "command control byte");
assert.equal(init[1], 0xAE, "display off first");
assert.deepEqual(init.slice(init.indexOf(0xA8), init.indexOf(0xA8) + 2), [0xA8, 63]);
assert.deepEqual(init.slice(init.indexOf(0x8D), init.indexOf(0x8D) + 2), [0x8D, 0x14], "charge pump on");
assert.ok(init.includes(0xA1) && init.includes(0xC8), "normal orientation");
assert.deepEqual(init.slice(init.indexOf(0xDA), init.indexOf(0xDA) + 2), [0xDA, 0x12]);
assert.ok(!init.includes(0xAF), "stays off until the first picture");

screen = new Screen(128, 64);
screen.print("ok", { y: 16 });
panel.flush(screen);
const pages = MockI2C.writes.filter(w => w[0] === 0x00 && (w[1] & 0xF0) === 0xB0).map(w => w[1] & 0x0F);
assert.deepEqual(pages, [0, 1, 2, 3, 4, 5, 6, 7], "first flush sends every page");
const data = MockI2C.writes.filter(w => w[0] === 0x40);
assert.equal(data.length, 8);
assert.ok(data.every(w => w.length === 129));
assert.deepEqual(MockI2C.writes.at(-1), [0x00, 0xAF], "display on after the first picture");

MockI2C.writes.length = 0;
screen.print("ok!", { y: 40 });
panel.flush(screen);
assert.deepEqual(MockI2C.writes.filter(w => w[0] === 0x00).map(w => w[1]), [0xB5], "only page 5 again, no power on");
assert.deepEqual(MockI2C.writes[0], [0x00, 0xB5, 0x00, 0x10]);

MockI2C.writes.length = 0;
panel.contrast(300);
panel.power(false);
panel.invert(true);
assert.deepEqual(MockI2C.writes, [[0x00, 0x81, 255], [0x00, 0xAE], [0x00, 0xA7]]);

/* rotation and 128 x 32 */
MockI2C.writes.length = 0;
new SSD1306({ ...options, controller: "ssd1306", height: 32, rotate: true }).open();
const rotated = MockI2C.writes.shift();
assert.ok(rotated.includes(0xA0) && rotated.includes(0xC0), "rotated 180 degrees");
assert.deepEqual(rotated.slice(rotated.indexOf(0xA8), rotated.indexOf(0xA8) + 2), [0xA8, 31]);
assert.deepEqual(rotated.slice(rotated.indexOf(0xDA), rotated.indexOf(0xDA) + 2), [0xDA, 0x02]);

/* errors */
assert.throws(() => new SSD1306({ ...options, controller: "sh1106" }), /unknown controller/);
assert.throws(() => new SSD1306({ ...options, height: 48 }), /unsupported size/);
class Nack extends MockI2C {
    write() {
        throw new Error("I2C write failed");
    }
}
const missing = new SSD1306({ ...options, io: Nack });
assert.throws(() => missing.open(), /I2C write failed/);
assert.equal(missing.opened, false, "closed after a failed open");

/* format: text, dates and times in local time */
const when = new Date(2026, 9, 17, 9, 5, 7);
assert.equal(format("Hello"), "Hello");
assert.equal(format(23.5), "23.5");
assert.equal(format(true), "true");
assert.equal(format(undefined), "");
assert.equal(format(when.getTime()), "2026-10-17 09:05:07", "an inject timestamp in text");
assert.equal(format(5000), "5000", "a small number stays a number in text");
assert.equal(format(1e15), "1000000000000000", "a large number stays a number in text");
assert.equal(format(when.getTime() + 0.5), String(when.getTime() + 0.5), "a fraction stays a number in text");
assert.equal(format("Line 1\\nLine 2"), "Line 1\nLine 2", "typed \\n is a new line");
assert.equal(format("Line 1\nLine 2"), "Line 1\nLine 2", "a new line stays");
assert.equal(format(when), "2026-10-17 09:05:07", "a Date in text");
assert.equal(format(when.getTime(), "time"), "09:05:07", "inject timestamp");
assert.equal(format(String(when.getTime()), "time"), "09:05:07", "timestamp as a string");
assert.equal(format(when, "hm"), "09:05");
assert.equal(format(when, "date"), "2026-10-17");
assert.equal(format(when.toISOString(), "datetime"), "2026-10-17 09:05:07", "ISO string");
assert.equal(format("not a date", "time"), "not a date", "invalid dates as they are");
assert.equal(format(when, "unknown"), "2026-10-17 09:05:07");

fs.rmSync(dir, { recursive: true, force: true });
console.log("font / format / screen / ssd1306: all tests passed");
