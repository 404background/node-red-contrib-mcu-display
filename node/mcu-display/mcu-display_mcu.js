/*
 * mcu-display - MCU runtime
 *
 * Shows msg.payload on the display of its mcu-display-config node.
 *   string / number / boolean / Date  text at the node's line, size and
 *       alignment, formatted by the node's format (display/format)
 *   { text, line, x, y, size, align, clear, invert, format }  one item; omitted
 *       properties come from the node
 *   { clear: true }            clears the screen
 *   { contrast: 0 - 255 }, { power: false }  panel settings
 *   an array of these          drawn in order, sent to the panel once; an
 *       item without line / y goes below the previous one
 * With a timeout (seconds, 0: never) the text of the last message is
 * cleared that long after it was drawn.
 * Text longer than the screen width wraps, is cut, scrolls sideways or
 * wraps and scrolls up when it is taller than the space to the bottom of
 * the screen (overflow: "wrap" | "cut" | "scroll" | "scrollup"); scrolling
 * text is redrawn by a timer until the next message.
 * The message is sent on after the display has been updated.
 */

import { Node } from "nodered";
import Timer from "timer";
import format, { FORMATS } from "display/format";
import { textSize } from "display/screen";

const CLEAR = Object.freeze(["area", "all", "none"]);
const OVERFLOW = Object.freeze(["wrap", "cut", "scroll", "scrollup"]);
const STATUS_LENGTH = 20;
const SCROLL_INTERVAL = 50;     // ms per scroll step
const SCROLL_STEP = 2;          // pixels per step sideways (times the text size)
const SCROLL_UP_STEP = 1;       // pixels per step up (times the text size)

class DisplayNode extends Node {
    #display;
    #options;
    #scrolling = [];    // { text, options } of items with lines that scroll
    #timer;
    #timeout;           // ms until the text is cleared, 0: never
    #areas = [];        // { x, y, height } of the text of the last message
    #clearTimer;

    onStart(config) {
        super.onStart(config);

        this.#options = {
            line: Math.max(1, Math.floor(Number(config.line)) || 1),
            size: textSize(config.size),
            align: config.align || "left",
            clear: CLEAR.includes(config.clear) ? config.clear : "area",
            format: FORMATS.includes(config.format) ? config.format : "text",
            overflow: OVERFLOW.includes(config.overflow) ? config.overflow : "wrap"
        };
        this.#timeout = Math.max(0, Math.round(Number(config.timeout) * 1000) || 0);

        const display = RED.nodes.getNode(config.display);
        if (!display?.attach) {
            this.status({ fill: "red", shape: "ring", text: "no display config" });
            return;
        }
        this.#display = display;
        display.attach(this);
    }

    onMessage(msg, done) {
        if (!this.#display) {
            done?.();
            return;
        }

        const payload = msg.payload;
        const items = Array.isArray(payload) ? payload : [payload];
        let shown, skipped = "";
        const areas = [];
        this.#stopScrolling();
        const error = this.#display.draw((screen, panel) => {
            let y = (this.#options.line - 1) * 8;
            for (const item of items) {
                const result = this.#item(screen, panel, item, y);
                if (result) {
                    shown ??= result.lines.join(" ");
                    skipped += result.skipped;
                    areas.push({ x: result.x, y: result.y, height: result.height });
                    y = result.y + result.height;
                }
            }
        });

        if (error) {
            this.status({ fill: "red", shape: "ring", text: error });
            done?.(error);
            return;
        }
        if (this.#scrolling.length)
            this.#timer = Timer.repeat(() => this.#scroll(), SCROLL_INTERVAL);
        if (areas.length && this.#timeout) {
            this.#areas = areas;
            if (this.#clearTimer)
                Timer.clear(this.#clearTimer);
            this.#clearTimer = Timer.set(() => this.#clearText(), this.#timeout);
        }
        if (skipped)
            this.warn(`not in the font (shown as ?): ${skipped}`);
        if (undefined !== shown)
            this.status({ fill: "green", shape: "dot", text: (shown.length > STATUS_LENGTH) ? shown.slice(0, STATUS_LENGTH - 1) + "…" : shown });
        this.send(msg);
        done?.();
    }

    #stopScrolling() {
        if (this.#timer)
            Timer.clear(this.#timer);
        this.#timer = undefined;
        this.#scrolling = [];
    }

    /* Clears the text of the last message when the timeout has passed */
    #clearText() {
        this.#clearTimer = undefined;
        this.#stopScrolling();
        const areas = this.#areas;
        this.#areas = [];
        const error = this.#display.draw(screen => {
            for (const { x, y, height } of areas)
                screen.fill(x, y, screen.width - x, height, false);
        });
        this.status(error ? { fill: "red", shape: "ring", text: error } : { fill: "grey", shape: "ring", text: "cleared" });
    }

    /* Moves the scrolling lines one step; stops when the display is lost */
    #scroll() {
        const error = this.#display.draw(screen => {
            for (const item of this.#scrolling) {
                if (undefined !== item.options.scrollUp)
                    item.options.scrollUp += SCROLL_UP_STEP * item.options.size;
                else
                    item.options.scroll += SCROLL_STEP * item.options.size;
                screen.print(item.text, item.options);
            }
        });
        if (error) {
            this.#stopScrolling();
            this.status({ fill: "red", shape: "ring", text: error });
        }
    }

    /* Prints text, remembering it for the timer when a line scrolls */
    #print(screen, text, options, overflow) {
        if ("cut" === overflow)
            options.wrap = false;
        else if ("scroll" === overflow)
            options.scroll = 0;
        else if ("scrollup" === overflow)
            options.scrollUp = 0;
        const result = screen.print(text, options);
        if (result.overflow) {
            /* later steps redraw only the item's own lines */
            this.#scrolling.push({ text, options: { ...options, size: textSize(options.size), clear: "area" } });
        }
        return { ...result, x: Math.max(0, Math.floor(Number(options.x)) || 0), y: options.y };
    }

    /*
     * Draws one item, at y unless it has its own line / y. Returns the result
     * of screen.print() and the y used, or undefined when no text was drawn.
     */
    #item(screen, panel, item, y) {
        const options = this.#options;
        if ((null === item) || ("object" !== typeof item) || (item instanceof Date))
            item = { text: item };      // a value: shown with the node's settings, undefined clears its line
        else {
            if (undefined !== item.contrast)
                panel.contrast(item.contrast);
            if (undefined !== item.power)
                panel.power(item.power);

            if (undefined === item.text) {
                if ((true === item.clear) || ("all" === item.clear))
                    screen.clear();
                return;
            }
        }

        if (undefined !== item.y)
            y = Math.floor(Number(item.y)) || 0;
        else if (undefined !== item.line)
            y = (Math.max(1, Math.floor(Number(item.line)) || 1) - 1) * 8;
        return this.#print(screen, format(item.text, item.format ?? options.format), {
            x: item.x,
            y,
            size: item.size ?? options.size,
            align: item.align ?? options.align,
            clear: item.clear ?? options.clear,
            invert: item.invert
        }, item.overflow ?? ((false === item.wrap) ? "cut" : options.overflow));
    }

    static type = "mcu-display";

    static {
        RED.nodes.registerType(this.type, this);
    }
}

export default DisplayNode;
