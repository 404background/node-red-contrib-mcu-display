/* Editor-side definition only: the node runs on the MCU (mcu-display_mcu.js) */
module.exports = function (RED) {
    function DisplayNode(config) {
        RED.nodes.createNode(this, config);
    }

    RED.nodes.registerType("mcu-display", DisplayNode);
};
