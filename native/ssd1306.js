/*
 * display/ssd1306 - SSD1306 / SSD1315 OLED controller over I2C
 *
 * Uses the ECMA-419 I2C of the board (device.I2C.default or the pins given).
 * The SSD1315 understands the SSD1306 commands used here; the controller
 * setting only selects its own charge pump value.
 *
 * Every I2C transfer starts with a control byte:
 *   0x00 commands follow, 0x40 display RAM data follows.
 */

const CONTROL_COMMAND = 0x00;
const CONTROL_DATA = 0x40;

/* Charge pump (0x8D) setting: 0x14 enables the internal 7.5 V pump */
const CONTROLLERS = Object.freeze({
    ssd1306: Object.freeze({ chargePump: 0x14 }),
    ssd1315: Object.freeze({ chargePump: 0x14 })
});

export const SIZES = Object.freeze(["128x64", "128x32"]);

class SSD1306 {
    #i2c;
    #options;
    #width;
    #height;

    /*
     * options: { controller: "ssd1306" | "ssd1315", width, height, address,
     *   data, clock (pins), hz, rotate (true: 180 degrees), io (I2C class) }
     */
    constructor(options) {
        if (!CONTROLLERS[options.controller])
            throw new Error(`unknown controller "${options.controller}"`);
        if (!SIZES.includes(`${options.width}x${options.height}`))
            throw new Error(`unsupported size ${options.width}x${options.height}`);
        this.#options = options;
        this.#width = options.width;
        this.#height = options.height;
    }

    get width() {
        return this.#width;
    }

    get height() {
        return this.#height;
    }

    get opened() {
        return !!this.#i2c;
    }

    /* Opens the bus and initializes the panel (display off until the first page is sent). Throws when it does not answer */
    open() {
        if (this.#i2c)
            return;
        const { io, data, clock, address, hz, rotate, controller } = this.#options;
        this.#i2c = new io({ data, clock, address, hz });
        try {
            const tall = 64 === this.#height;
            this.command(
                0xAE,                       // display off
                0xD5, 0x80,                 // clock divide / oscillator
                0xA8, this.#height - 1,     // multiplex ratio
                0xD3, 0x00,                 // display offset
                0x40,                       // start line 0
                0x8D, CONTROLLERS[controller].chargePump,
                0x20, 0x02,                 // page addressing
                rotate ? 0xA0 : 0xA1,       // segment remap (column 127 = SEG0 when not rotated)
                rotate ? 0xC0 : 0xC8,       // COM scan direction
                0xDA, tall ? 0x12 : 0x02,   // COM pins
                0x81, tall ? 0xCF : 0x8F,   // contrast
                0xD9, 0xF1,                 // pre-charge
                0xDB, 0x40,                 // VCOMH
                0x2E,                       // no scrolling
                0xA4,                       // show RAM
                0xA6                        // not inverted
            );
        }
        catch (e) {
            this.close();
            throw e;
        }
        this.#on = false;
    }

    #on = false;

    close() {
        try {
            this.#i2c?.close();
        }
        catch {
        }
        this.#i2c = undefined;
    }

    command(...bytes) {
        this.#i2c.write(Uint8Array.of(CONTROL_COMMAND, ...bytes));
    }

    /* Sends one page (8 rows) of display RAM */
    writePage(page, bytes) {
        this.command(0xB0 | page, 0x00, 0x10);     // page, column 0
        const message = new Uint8Array(bytes.length + 1);
        message[0] = CONTROL_DATA;
        message.set(bytes, 1);
        this.#i2c.write(message);
    }

    /* Sends the changed pages of screen (display/screen); turns the display on after the first send */
    flush(screen) {
        const dirty = screen.takeDirty();
        for (let page = 0; page < screen.pages; page++) {
            if (dirty & (1 << page))
                this.writePage(page, screen.page(page));
        }
        if (!this.#on) {
            this.command(0xAF);
            this.#on = true;
        }
    }

    contrast(value) {
        this.command(0x81, Math.min(255, Math.max(0, Math.round(Number(value)) || 0)));
    }

    power(on) {
        this.command(on ? 0xAF : 0xAE);
        this.#on = !!on;
    }

    invert(on) {
        this.command(on ? 0xA7 : 0xA6);
    }
}

export default SSD1306;
