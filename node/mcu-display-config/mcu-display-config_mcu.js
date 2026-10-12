/*
 * mcu-display-config - MCU runtime
 *
 * Configuration node: one SSD1306 / SSD1315 OLED on I2C and its frame
 * buffer. mcu-display nodes attach to it and draw through draw().
 * The panel is opened at start; when it does not answer, every draw tries
 * again, so a display connected later is picked up.
 */

import { Node } from "nodered";
import Screen from "display/screen";
import SSD1306 from "display/ssd1306";

/* Displays already started, by "address:data:clock" */
let used;

/* Pin from the editor, or the board's default I2C pin when empty */
function pinOrDefault(value, fallback) {
    if ((value === undefined) || (value === null) || (value === ""))
        return fallback;
    const pin = Number(value);
    return (Number.isInteger(pin) && (pin >= 0)) ? pin : fallback;
}

class DisplayConfigNode extends Node {
    #panel;
    #screen;
    #error;
    #nodes = [];

    onStart(config) {
        super.onStart(config);

        const bus = globalThis.device?.I2C?.default;
        if (!bus?.io) {
            this.#error = "no I2C on this board";
            this.error(this.#error);
            return;
        }

        const [width, height] = String(config.size || "128x64").split("x").map(Number);
        const address = Number(config.address || "0x3C");
        const data = pinOrDefault(config.sda, bus.data);
        const clock = pinOrDefault(config.scl, bus.clock);
        if (!Number.isInteger(address) || (address < 0x03) || (address > 0x77)) {
            this.#error = "invalid I2C address";
            this.error(this.#error);
            return;
        }

        const key = `${address}:${data}:${clock}`;
        used ??= new Set;
        if (used.has(key)) {
            this.#error = "display already used by another config";
            this.error(this.#error);
            return;
        }
        used.add(key);

        try {
            this.#panel = new SSD1306({
                controller: config.controller || "ssd1306",
                width, height, address, data, clock,
                hz: Number(config.hz) || 400_000,
                rotate: (true === config.rotate) || ("true" === config.rotate),
                io: bus.io
            });
        }
        catch (e) {
            this.#error = e.message;
            this.error(this.#error);
            return;
        }
        this.#screen = new Screen(width, height);
        this.#open();
    }

    /* Opens the panel and shows the frame buffer; returns an error message */
    #open() {
        if (this.#panel.opened)
            return;
        try {
            this.#panel.open();
            this.#screen.invalidate();
            this.#panel.flush(this.#screen);
        }
        catch (e) {
            this.#panel.close();
            this.#report("display not found");
            return "display not found";
        }
        this.#report();
    }

    /* Shows the state on every attached node */
    #report(error) {
        for (const node of this.#nodes)
            node.status(error ? { fill: "red", shape: "ring", text: error } : { fill: "green", shape: "dot", text: "ready" });
    }

    attach(node) {
        this.#nodes.push(node);
        if (this.#error)
            node.status({ fill: "red", shape: "ring", text: this.#error });
        else if (this.#panel.opened)
            node.status({ fill: "green", shape: "dot", text: "ready" });
        else
            node.status({ fill: "red", shape: "ring", text: "display not found" });
    }

    get screen() {
        return this.#screen;
    }

    /*
     * Runs draw(screen, panel) and sends the changed pages.
     * Returns an error message, or undefined.
     */
    draw(draw) {
        if (this.#error)
            return this.#error;
        const error = this.#open();
        if (error)
            return error;
        try {
            draw(this.#screen, this.#panel);
            this.#panel.flush(this.#screen);
        }
        catch (e) {
            /* lost: open again on the next message */
            this.#panel.close();
            this.#screen.invalidate();
            this.#report("display not found");
            return e.message;
        }
    }

    static type = "mcu-display-config";

    static {
        RED.nodes.registerType(this.type, this);
    }
}

export default DisplayConfigNode;
