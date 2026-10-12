/*
 * display/screen - 1 bit frame buffer with text drawing
 *
 * The buffer has the layout of SSD1306 / SSD1315 display RAM: one byte is
 * 8 vertical pixels (bit 0 at the top) of a page (8 pixel rows), so a page
 * is sent to the display as it is. Pages that changed since the last
 * takeDirty() are tracked.
 */

import { glyph, CELL_WIDTH, CELL_HEIGHT, GLYPH_WIDTH, GLYPH_HEIGHT } from "display/font";

const MAX_SIZE = 4;
const ALIGNS = Object.freeze(["left", "center", "right"]);

class Screen {
    #width;
    #height;
    #buffer;
    #dirty = 0;     // bit n: page n changed

    constructor(width, height) {
        this.#width = width;
        this.#height = height;
        this.#buffer = new Uint8Array(width * (height >> 3));
        this.#dirty = (1 << (height >> 3)) - 1;
    }

    get width() {
        return this.#width;
    }

    get height() {
        return this.#height;
    }

    get pages() {
        return this.#height >> 3;
    }

    /* The bytes of page (8 rows) */
    page(page) {
        return this.#buffer.subarray(page * this.#width, (page + 1) * this.#width);
    }

    /* Bit mask of the pages changed since the last call */
    takeDirty() {
        const dirty = this.#dirty;
        this.#dirty = 0;
        return dirty;
    }

    /* Marks every page changed, so the whole screen is sent again */
    invalidate() {
        this.#dirty = (1 << this.pages) - 1;
    }

    pixel(x, y) {
        if ((x < 0) || (y < 0) || (x >= this.#width) || (y >= this.#height))
            return 0;
        return (this.#buffer[(y >> 3) * this.#width + x] >> (y & 7)) & 1;
    }

    /* Sets (on) or clears the rectangle, clipped to the screen */
    fill(x, y, width, height, on) {
        const x0 = Math.max(0, Math.floor(x)), x1 = Math.min(this.#width, Math.floor(x + width));
        const y0 = Math.max(0, Math.floor(y)), y1 = Math.min(this.#height, Math.floor(y + height));
        if ((x0 >= x1) || (y0 >= y1))
            return;
        const buffer = this.#buffer, w = this.#width;
        for (let page = y0 >> 3, last = (y1 - 1) >> 3; page <= last; page++) {
            const top = Math.max(y0, page << 3) & 7;
            const bottom = Math.min(y1, (page + 1) << 3) - (page << 3);   // exclusive, 1..8
            const mask = ((1 << bottom) - 1) & ~((1 << top) - 1);
            const offset = page * w;
            for (let i = x0; i < x1; i++) {
                if (on)
                    buffer[offset + i] |= mask;
                else
                    buffer[offset + i] &= ~mask;
            }
            this.#dirty |= 1 << page;
        }
    }

    clear() {
        this.fill(0, 0, this.#width, this.#height, false);
    }

    /*
     * Draws one character at (x, y) scaled by size; on: pixel value of the
     * glyph. Returns false when the font has no glyph for char.
     */
    #char(char, x, y, size, on) {
        const columns = glyph(char);
        if (!columns)
            return false;
        for (let column = 0; column < GLYPH_WIDTH; column++) {
            const bits = columns[column];
            for (let row = 0; row < GLYPH_HEIGHT; row++) {
                if ((bits >> row) & 1)
                    this.fill(x + column * size, y + row * size, size, size, on);
            }
        }
        return true;
    }

    /*
     * Draws text and returns { lines, height, skipped }.
     * options:
     *   x, y     top left in pixels (default 0, 0)
     *   size     1 - 4: a character is 6 x 8 pixels times size (default 1)
     *   align    "left" | "center" | "right" within x .. screen width
     *   clear    "area": clears the rows the text uses first (default)
     *            "all": clears the screen first, "none": draws over
     *   invert   true: light background, dark text
     *   wrap     false: lines longer than the screen are cut (default true)
     * "\n" starts a new line. Characters without a glyph are drawn as "?"
     * and returned in skipped.
     */
    print(text, options = {}) {
        const size = Math.min(MAX_SIZE, Math.max(1, Math.floor(Number(options.size)) || 1));
        const x = Math.max(0, Math.floor(Number(options.x)) || 0);
        const y = Math.floor(Number(options.y)) || 0;
        const align = ALIGNS.includes(options.align) ? options.align : "left";
        const cellWidth = CELL_WIDTH * size, cellHeight = CELL_HEIGHT * size;
        const columns = Math.max(1, Math.floor((this.#width - x + size) / cellWidth));  // last blank column may fall off

        const lines = [];
        for (const line of String(text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
            const chars = Array.from(line);
            if (options.wrap === false || chars.length <= columns) {
                lines.push(chars.slice(0, columns));
                continue;
            }
            for (let i = 0; i < chars.length; i += columns)
                lines.push(chars.slice(i, i + columns));
        }
        const height = lines.length * cellHeight;

        const clear = options.clear ?? "area";
        if ((true === clear) || ("all" === clear))
            this.clear();
        if ((true === clear) || ("all" === clear) || ("area" === clear) || options.invert)
            this.fill(x, y, this.#width - x, height, !!options.invert);

        const skipped = [];
        lines.forEach((chars, i) => {
            const textWidth = chars.length * cellWidth - size;
            let left = x;
            if ("center" === align)
                left = x + Math.floor((this.#width - x - textWidth) / 2);
            else if ("right" === align)
                left = this.#width - textWidth;
            chars.forEach((char, j) => {
                if (!this.#char(char, left + j * cellWidth, y + i * cellHeight, size, !options.invert)) {
                    skipped.push(char);
                    this.#char("?", left + j * cellWidth, y + i * cellHeight, size, !options.invert);
                }
            });
        });
        return { lines: lines.map(chars => chars.join("")), height, skipped: skipped.join("") };
    }
}

export default Screen;
