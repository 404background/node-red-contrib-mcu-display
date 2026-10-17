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
 * The message is sent on after the display has been updated.
 */

import { Node } from "nodered";
import format, { FORMATS } from "display/format";

const CLEAR = Object.freeze(["area", "all", "none"]);
const STATUS_LENGTH = 20;

class DisplayNode extends Node {
    #display;
    #options;

    onStart(config) {
        super.onStart(config);

        this.#options = {
            line: Math.max(1, Math.floor(Number(config.line)) || 1),
            size: Math.max(1, Math.min(4, Math.floor(Number(config.size)) || 1)),
            align: config.align || "left",
            clear: CLEAR.includes(config.clear) ? config.clear : "area",
            format: FORMATS.includes(config.format) ? config.format : "text"
        };

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
        const error = this.#display.draw((screen, panel) => {
            let y = (this.#options.line - 1) * 8;
            for (const item of items) {
                const result = this.#item(screen, panel, item, y);
                if (result) {
                    shown ??= result.lines.join(" ");
                    skipped += result.skipped;
                    y = result.y + result.height;
                }
            }
        });

        if (error) {
            this.status({ fill: "red", shape: "ring", text: error });
            done?.(error);
            return;
        }
        if (skipped)
            this.warn(`not in the font (shown as ?): ${skipped}`);
        if (undefined !== shown)
            this.status({ fill: "green", shape: "dot", text: (shown.length > STATUS_LENGTH) ? shown.slice(0, STATUS_LENGTH - 1) + "…" : shown });
        this.send(msg);
        done?.();
    }

    /*
     * Draws one item, at y unless it has its own line / y. Returns the result
     * of screen.print() and the y used, or undefined when no text was drawn.
     */
    #item(screen, panel, item, y) {
        const options = this.#options;
        if ((null === item) || ("object" !== typeof item) || (item instanceof Date)) {
            const result = screen.print(format(item, options.format), {
                y,
                size: options.size,
                align: options.align,
                clear: options.clear
            });
            return { ...result, y };
        }

        if (undefined !== item.contrast)
            panel.contrast(item.contrast);
        if (undefined !== item.power)
            panel.power(item.power);

        if (undefined === item.text) {
            if ((true === item.clear) || ("all" === item.clear))
                screen.clear();
            return;
        }

        if (undefined !== item.y)
            y = Math.floor(Number(item.y)) || 0;
        else if (undefined !== item.line)
            y = (Math.max(1, Math.floor(Number(item.line)) || 1) - 1) * 8;
        const result = screen.print(format(item.text, item.format ?? options.format), {
            x: item.x,
            y,
            size: item.size ?? options.size,
            align: item.align ?? options.align,
            clear: item.clear ?? options.clear,
            invert: item.invert,
            wrap: item.wrap
        });
        return { ...result, y };
    }

    static type = "mcu-display";

    static {
        RED.nodes.registerType(this.type, this);
    }
}

export default DisplayNode;
