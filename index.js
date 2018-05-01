"use strict";

let Service, Characteristic;
let request = require("request");

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-http-fanv2", "HTTP-FAN-V2", HTTP_FAN_V2);
};

function HTTP_FAN_V2(log, config) {
    this.log = log;
    this.name = config.name;

    this.active = {};
    this.rotationSpeed = { enabled: false };

    if (typeof config.active === 'object') {
        this.active.httpMethod = config.active.httpMethod || "GET";

        this.active.onUrl = config.active.onUrl;
        this.active.offUrl = config.active.offUrl;
        this.active.statusUrl = config.active.statusUrl;
    }

    if (typeof config.rotationSpeed === 'object') {
        this.rotationSpeed.enabled = true;

        this.rotationSpeed.httpMethod = config.rotationSpeed.httpMethod || "GET";

        this.rotationSpeed.setUrl = config.rotationSpeed.setUrl;
        this.rotationSpeed.statusUrl = config.rotationSpeed.statusUrl;
    }

    this.homebridgeService = new Service.Fanv2(this.name);

    this.homebridgeService.getCharacteristic(Characteristic.Active)
        .on("get", this.getActiveState.bind(this))
        .on("set", this.setActiveState.bind(this));

    if (this.rotationSpeed.enabled) {
        this.homebridgeService.addCharacteristic(Characteristic.RotationSpeed)
            .on("get", this.getRotationSpeed.bind(this))
            .on("set", this.setRotationSpeed.bind(this));
    }

}

HTTP_FAN_V2.prototype = {

    identify: function (callback) {
        this.log("Identify requested!");
        callback();
    },

    getServices: function () {
        return [this.homebridgeService];
    },

    getActiveState: function (callback) {
        const that = this;

        this._doRequest("getActiveState", this.active.statusUrl, "GET", "active.statusUrl", callback, function (body) {
            const active = parseInt(body);

            if (active !== 0 && active !== 1) {
                that.log("active.statusUrl responded with an invalid value: " + active);
                callback(new Error("active.statusUrl responded with an invalid value: " + active));
            }
            else {
                that.log("fan is currently %s", active === 1 ? "ACTIVE" : "INACTIVE");

                callback(null, active);
            }
        });
    },

    setActiveState: function (active, callback) {
        const that = this;

        const url = active === 1? this.active.onUrl: this.active.offUrl;
        const urlName = active === 1? "active.onUrl": "active.offUrl";

        this._doRequest("setActiveState", url, this.active.httpMethod, urlName, callback, function (body) {
            that.log("fan successfully set to %s", active === 1? "ACTIVE": "INACTIVE");

            callback(undefined, body);
        });
    },

    getRotationSpeed: function (callback) {
        const that = this;

        this._doRequest("getRotationSpeed", this.rotationSpeed.statusUrl, "GET", "rotationSpeed.statusUrl", callback, function (body) {
            const rotationSpeed = parseInt(body);
            that.log("rotationSpeed is currently at %s %", rotationSpeed);

            callback(null, rotationSpeed);
        });
    },

    setRotationSpeed: function (rotationSpeed, callback) {
        const that = this;

        let url = this.rotationSpeed.setUrl;
        if (url)
            url = this.rotationSpeed.setUrl.replace("%s", rotationSpeed);

        this._doRequest("setRotationSpeed", url, this.rotationSpeed.httpMethod, "rotationSpeed.setUrl", callback, function (body) {
            that.log("rotationSpeed successfully set to %s %", rotationSpeed);

            callback(undefined, body);
        });
    },

    _doRequest: function (methodName, url, httpMethod, urlName, callback, successCallback) {
        if (!url) {
            this.log.warn("Ignoring " + methodName + "() request, '" + urlName + "' is not defined!");
            callback(new Error("No '" + urlName + "' defined!"));
            return;
        }

        let that = this;

        request(
            {
                url: url,
                body: "",
                method: httpMethod,
                rejectUnauthorized: false
            },
            function (error, response, body) {
                if (error) {
                    that.log(methodName + "() failed: %s", error.message);
                    callback(error);
                }
                else if (response.statusCode !== 200) {
                    that.log(methodName + "() returned http error: %s", response.statusCode);
                    callback(new Error("Got http error code " + response.statusCode));
                }
                else {
                    successCallback(body);
                }
            }
        );
    }

};