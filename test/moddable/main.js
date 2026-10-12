/*
 * Moddable SDK test of the display classes without Node-RED.
 * Shows a few lines on the display at the board's default I2C pins.
 *   mcconfig -d -m -p esp32 controller=ssd1315 size=128x32 address=0x3D
 */
import config from "mc/config";
import Timer from "timer";
import Screen from "display/screen";
import SSD1306 from "display/ssd1306";

const [width, height] = config.size.split("x").map(Number);
const bus = device.I2C.default;
const panel = new SSD1306({
    controller: config.controller,
    width, height,
    address: Number(config.address),
    data: bus.data,
    clock: bus.clock,
    hz: 400_000,
    io: bus.io
});
const screen = new Screen(width, height);

try {
    panel.open();
}
catch (e) {
    trace(`display not found at ${config.address}: ${e.message}\n`);
    throw e;
}

screen.print("Moddable", { size: 2, align: "center" });
screen.print("°±×←→↑↓●○■□♥★✓", { y: 16 });
panel.flush(screen);
trace(`${config.controller} ${config.size} ready\n`);

let count = 0;
Timer.repeat(() => {
    screen.print(`count: ${++count}`, { y: 24, align: "right" });
    panel.flush(screen);
}, 1000);
