"use strict";

let Service, Characteristic, api;

const request = require("request");
const packageJSON = require("./package.json");

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    api = homebridge;

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

    this.notificationID = config.notificationID;
    this.notificationPassword = config.notificationPassword;

    if (this.notificationID) {
        api.on('didFinishLaunching', function() {
            if (api.notificationRegistration && typeof api.notificationRegistration === "function") {
                try {
                    api.notificationRegistration(this.notificationID, this.handleNotification.bind(this), this.notificationPassword);
                    this.log("Detected running notification server. Registered successfully!");
                } catch (error) {
                    this.log("Could not register notification handler. ID '" + this.notificationID + "' is already taken!")
                }
            }
        }.bind(this));
    }
}

HTTP_FAN_V2.prototype = {

    identify: function (callback) {
        this.log("Identify requested!");
        callback();
    },

    getServices: function () {
        const informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, "Andreas Bauer")
            .setCharacteristic(Characteristic.Model, "HTTP Fan")
            .setCharacteristic(Characteristic.SerialNumber, "FAN02")
            .setCharacteristic(Characteristic.FirmwareRevision, packageJSON.version);

        return [informationService, this.homebridgeService];
    },

    handleNotification: function (body) {
        const value = body.value;

        let characteristic;
        switch (body.characteristic) {
            case "Active":
                characteristic = Characteristic.Active;
                break;
            case "RotationSpeed":
                characteristic = Characteristic.RotationSpeed;
                break;
            default:
                this.log("Encountered unknown characteristic handling notification: " + body.characteristic);
                return;
        }

        this.log("Updating '" + body.characteristic + "' to new value: " + body.value);

        this.ignoreNextSet = true; // we use one variable for every characteristic, since every characteristic has an pw currently
        this.homebridgeService.setCharacteristic(characteristic, value);
    },

    getActiveState: function (callback) {
        this._doRequest("getActiveState", this.active.statusUrl, "GET", "active.statusUrl", callback, function (body) {
            const active = parseInt(body);

            if (active !== 0 && active !== 1) {
                this.log("active.statusUrl responded with an invalid value: " + active);
                callback(new Error("active.statusUrl responded with an invalid value: " + active));
            }
            else {
                this.log("fan is currently %s", active === 1 ? "ACTIVE" : "INACTIVE");

                callback(null, active);
            }
        }.bind(this));
    },

    setActiveState: function (active, callback) {
        if (this.ignoreNextSet) {
            this.ignoreNextSet = false;
            callback(undefined);
            return;
        }

        const url = active === 1? this.active.onUrl: this.active.offUrl;
        const urlName = active === 1? "active.onUrl": "active.offUrl";

        this._doRequest("setActiveState", url, this.active.httpMethod, urlName, callback, function (body) {
            this.log("fan successfully set to %s", active === 1? "ACTIVE": "INACTIVE");

            callback(undefined, body);
        }.bind(this));
    },

    getRotationSpeed: function (callback) {
        this._doRequest("getRotationSpeed", this.rotationSpeed.statusUrl, "GET", "rotationSpeed.statusUrl", callback, function (body) {
            const rotationSpeed = parseInt(body);
            this.log("rotationSpeed is currently at %s %", rotationSpeed);

            callback(null, rotationSpeed);
        }.bind(this));
    },

    setRotationSpeed: function (rotationSpeed, callback) {
        if (this.ignoreNextSet) {
            this.ignoreNextSet = false;
            callback(undefined);
            return;
        }

        let url = this.rotationSpeed.setUrl;
        if (url)
            url = this.rotationSpeed.setUrl.replace("%s", rotationSpeed);

        this._doRequest("setRotationSpeed", url, this.rotationSpeed.httpMethod, "rotationSpeed.setUrl", callback, function (body) {
            this.log("rotationSpeed successfully set to %s %", rotationSpeed);

            callback(undefined, body);
        }.bind(this));
    },

    _doRequest: function (methodName, url, httpMethod, urlName, callback, successCallback) {
        if (!url) {
            this.log.warn("Ignoring " + methodName + "() request, '" + urlName + "' is not defined!");
            callback(new Error("No '" + urlName + "' defined!"));
            return;
        }

        request(
            {
                url: url,
                body: "",
                method: httpMethod,
                rejectUnauthorized: false
            },
            function (error, response, body) {
                if (error) {
                    this.log(methodName + "() failed: %s", error.message);
                    callback(error);
                }
                else if (response.statusCode !== 200) {
                    this.log(methodName + "() returned http error: %s", response.statusCode);
                    callback(new Error("Got http error code " + response.statusCode));
                }
                else {
                    successCallback(body);
                }
            }.bind(this)
        );
    }

};