# node-red-contrib-mcu-display

OLED display nodes for [Node-RED MCU Edition](https://github.com/phoddie/node-red-mcu).
Shows text and symbols from the flow on an **SSD1306** or **SSD1315** OLED display connected over **I2C**: SSD1306 modules are usually 0.96 inch 128 x 64 or 0.91 inch 128 x 32, SSD1315 modules usually 0.96 inch 128 x 64.

日本語: [docs/ja/README.md](docs/ja/README.md)

Status: tested in the Moddable simulator with an emulated display and built for ESP32 / XIAO ESP32S3 / XIAO ESP32C3 with Moddable SDK 7.2.1 / ESP-IDF 5.5.1. Not tested on hardware yet.

## Install

```sh
cd ~/.node-red
npm install @background404/node-red-contrib-mcu-display
```

## OLED modules

Examples of OLED modules (Amazon):

- https://link.amazon/B02OXPvgX
- https://link.amazon/B0brU5Ri3

## Wiring

| Display | Board |
|---|---|
| VCC | 3.3 V |
| GND | GND |
| SDA | SDA pin (the board's default I2C SDA, or the pin set in the config node) |
| SCL | SCL pin |

Most modules use the I2C address `0x3C` (`0x3D` when the address jumper is changed; `0x78` / `0x7A` printed on the back is the same address shifted left by one bit).

## Nodes

- **display config** (`mcu-display-config`) - The display: controller (SSD1306 / SSD1315), size (128 x 64 / 128 x 32), I2C address, SDA / SCL pins (empty: board default), I2C speed, rotate 180°
- **display** (`mcu-display`) - Shows `msg.payload` at a line, with a text size (1 - 4) and alignment, and passes the message on

### Input of display

| `msg.payload` | Result |
|---|---|
| `"Hello"`, `23.5` | Shown at the node's line, size and alignment. `\n` starts a new line; long lines wrap (or scroll / are cut, see *Long lines*) |
| `{ "text": "23.5°C", "line": 3, "size": 2, "align": "right" }` | One item; its properties override the node's settings (`x`, `y` in pixels, `invert`, `clear`, `wrap` too) |
| `["Temp", { "text": "23.5°C", "size": 2 }]` | Items in order; an item without `line` / `y` goes below the previous one |
| `1760000000000` (inject *timestamp*), a `Date` | With the format *Time (HH:MM:SS)*: `09:05:07`. Also *Time (HH:MM)*, *Date (YYYY-MM-DD)*, *Date and time*; a `Date` in *Text* shows date and time |
| `"Node-RED MCU on XIAO ESP32C3: ..."` with *Long lines* set to *Scroll sideways* | A line longer than the screen scrolls from right to left until the next message (`{ "text": "...", "overflow": "scroll" }` for one item) |
| `{ "clear": true }` | Clears the screen |
| `{ "contrast": 128 }`, `{ "power": false }` | Brightness (0 - 255), display off / on |

- Times are in the device's local time. The clock is set over Wi-Fi (SNTP) or by xsbug when debugging; without them it starts at 1970-01-01.
- A line is 8 pixels high: lines 1 - 8 on 128 x 64, 1 - 4 on 128 x 32. A character is 6 x 8 pixels times the text size (size 1: 21 characters per line).
- **Before drawing**: *Clear the lines of the text* (default) only erases the lines the text uses, so several display nodes can update their own lines of one screen. *Clear the screen* and *Draw over the screen* are the other choices.
- Characters: ASCII and `° ± × ÷ µ ¥ ← → ↑ ↓ ● ○ ■ □ ▲ ▼ ♥ ★ ♪ ✓ … █`. Other characters (for example Japanese) are shown as `?` with a warning.
- Several displays can be used at once on different addresses (one config node each).

## Example

`examples/display.json` (Import > Examples > @background404/node-red-contrib-mcu-display): a title in size 2, a counter updated every second, a clock (inject timestamp shown as HH:MM:SS), symbols, a scrolling long text, a mixed-size temperature, inverted text and clearing the screen.

## How It Works

- `native/screen.js` (`display/screen`) - 1 bit frame buffer in the page layout of the controller's display RAM, text drawing with the 5 x 7 font of `native/font.js` (`display/font`), and tracking of changed pages
- `native/ssd1306.js` (`display/ssd1306`) - Initializes the panel over the board's ECMA-419 I2C (`device.I2C.default`) and sends only the pages that changed. SSD1315 takes the same commands
- The config node owns the panel and the frame buffer; display nodes draw through it

## Development

- `npm test` - the font, frame buffer and the I2C command stream of the driver on Node.js
- `test/moddable` - a Moddable SDK project without Node-RED: `cd test/moddable && mcconfig -d -m -p esp32`

## License

MIT
