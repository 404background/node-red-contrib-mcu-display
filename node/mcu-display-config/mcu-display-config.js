/* Editor-side definition only: the node runs on the MCU (mcu-display-config_mcu.js) */
module.exports = function (RED) {
    function DisplayConfigNode(config) {
        RED.nodes.createNode(this, config);
    }

    RED.nodes.registerType("mcu-display-config", DisplayConfigNode);
};
