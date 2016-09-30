/*** SecurityModeCustom Z-Way HA module *******************************************

Version: 1.0.0

This is a custom version of SecurityMode module that comes with Z-Way
-----------------------------------------------------------------------------
Authors: Govind Rathi <govind_rathi@hotmail.com>
        
Description:
    Implements Security rules and send notifications and activates scene on rule match.
******************************************************************************/

// ----------------------------------------------------------------------------
// --- Class definition, inheritance and setup
// ----------------------------------------------------------------------------

function SecurityModeCustom (id, controller) {
    // Call superconstructor first (AutomationModule)
    SecurityModeCustom.super_.call(this, id, controller);

    var self = this;
    
    this._testRule = function () { // wrapper to correct this and parameters in testRule
        self.testRule.call(self, null);
    };

    // Create instance variables
    this.timer = null;

    this.isSensorsCanReact = 1;
}

inherits(SecurityModeCustom, AutomationModule);

_module = SecurityModeCustom;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

SecurityModeCustom.prototype.init = function (config) {
    SecurityModeCustom.super_.prototype.init.call(this, config);

    var self = this;

    if (config.action.message) {this.message = config.action.message.toString();}
    if (config.action.api_key_sms) {this.api_key_sms = config.action.api_key_sms.toString();};
    if (config.action.api_key_email) {this.api_key_email = config.action.api_key_email.toString();};    
    if (config.action.phone) {this.phone = config.action.phone.toString();};
    if (config.action.email) {this.email = config.action.email.toString();}
    
    this.vDev = this.controller.devices.create({
            deviceId: "SecurityModeCustom_"+ this.id,
            defaults: {
                deviceType: "switchBinary",
                metrics: {
                    level: 'off',
                    icon: '',
                    title: 'SecurityModeCustom ' + this.id
                }
            },
            overlay: {},
            handler: function(command, args) {
                this.set("metrics:level", command);
                // Reset timer if Security Mode on
                if (command === "on") {
                    if (this.timer) {
                        clearTimeout(this.timer);
                    }
                    // Enable Sensors react 
                    self.isSensorsCanReact = 1;
                };
            },
            moduleId: this.id
        });

    self.attachDetach({device: this.vDev.id}, true);

    this.config.tests.forEach(function(test) {
        if (test.testType === "binary") {
            self.attachDetach(test.testBinary, true);
        } else if (test.testType === "multilevel") {
            self.attachDetach(test.testMultilevel, true);
        } else if (test.testType === "remote") {
            self.attachDetach(test.testRemote, true);
        }
    });    
};

SecurityModeCustom.prototype.stop = function () {
    var self = this;

    if (this.timer) {
        clearTimeout(this.timer);
    }

    if (this.vDev) {
        self.attachDetach(this.vDev.id, false);
    }
    
    this.config.tests.forEach(function(test) {
        if (test.testType === "binary") {
            self.attachDetach(test.testBinary, false);
        } else if (test.testType === "multilevel") {
            self.attachDetach(test.testMultilevel, false);
        } else if (test.testType === "remote") {
            self.attachDetach(test.testRemote, false);
        }
    });

    if (this.vDev) {
        this.controller.devices.remove(this.vDev.id);
        this.vDev = null;
    }

    SecurityModeCustom.super_.prototype.stop.call(this);
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

SecurityModeCustom.prototype.attachDetach = function (test, attachOrDetach) {
    if (attachOrDetach) {
        this.controller.devices.on(test.device, "change:metrics:level", this._testRule);
        this.controller.devices.on(test.device, "change:metrics:change", this._testRule);
    } else {
        this.controller.devices.off(test.device, "change:metrics:level", this._testRule);
        this.controller.devices.off(test.device, "change:metrics:change", this._testRule);
    }
};

SecurityModeCustom.prototype.testRule = function (tree) {

    var res = null,
        topLevel = !tree;
        self = this;
    
    if (!tree) {
        tree = this.config;
    }
    
    if (this.vDev.get("metrics:level") == "off")
        return;
    
    if (!this.isSensorsCanReact) {
        return;
    };

    res = false;
    tree.tests.forEach(function(test) {
        if (test.testType === "multilevel") {
            res = res || self.op(self.controller.devices.get(test.testMultilevel.device).get("metrics:level"), test.testMultilevel.testOperator, test.testMultilevel.testValue);
        } else if (test.testType === "binary") {
            res = res || (self.controller.devices.get(test.testBinary.device).get("metrics:level") === test.testBinary.testValue);
        } else if (test.testType === "remote") {
            var dev = self.controller.devices.get(test.testRemote.device);
            res = res || ((_.contains(["on", "off"], test.testRemote.testValue) && dev.get("metrics:level") === test.testRemote.testValue) || (_.contains(["upstart", "upstop", "downstart", "downstop"], test.testRemote.testValue) && dev.get("metrics:change") === test.testRemote.testValue));
        }
    });
    
    
    if (topLevel && res) {
        var self = this;

        // Disable sensors react to next period
        self.isSensorsCanReact = 0;
        self.timer = setTimeout(function () {
            // Enable Sensors react after timeout
            self.isSensorsCanReact = 1;
            // And clearing out this.timer variable
            self.timer = null;
        }, self.config.timeout*1000);

        // If API Key from sms.ru and Phone number exist, then send sms
        if (self.api_key_sms && self.phone) {
            http.request({
                method: 'POST',
                url: "http://sms.ru/sms/send",
                data: {
                    api_id: self.api_key_sms,
                    to: self.phone,
                    text: self.message
                }
            });
        }

        // If API Key from mandrillapp.com and Email exist, then send email
        if (self.api_key_email && self.email) {
            http.request({
                method: 'POST',
                url: "https://mandrillapp.com/api/1.0/messages/send.json",
                data: {
                    key: self.api_key_email,
                    message: {
                        from_email: self.email,
                        to: [{email: self.email, type: "to"}],
                        subject: "Notification from Smart Home",
                        text: self.message
                    }
                }
            });
        }
        
        // If PushOver API keys are present, send notification
        if( self.pn_api_key && self.pn_user_key) {
            http.request({
                method: 'POST',
                url: "https://api.pushover.net/1/messages.json",
                async: true,
                data: {
                    token: self.pn_api_key,
                    user: self.pn_user_key,
                    device: self.pn_user_device,
                    title: "Notification from Z-Way",
                    message: self.message
                },
                error: function(response) {
                    console.log("SecurityModeCustom_NotificationPushover-ERROR: " + response.statusText); 
                }
            });
        }

        // Send Notification
        self.controller.addNotification("warning", self.message, "module", "SecurityModeCustom");
        self.controller.emit('SecurityModeCustom.alert', self);

        tree.action.switches && tree.action.switches.forEach(function(devState) {
            var vDev = self.controller.devices.get(devState.device);
            if (vDev) {
                vDev.performCommand(devState.status);
            }
        });
        tree.action.dimmers && tree.action.dimmers.forEach(function(devState) {
            var vDev = self.controller.devices.get(devState.device);
            if (vDev) {
                vDev.performCommand("exact", { level: devState.status });
            }
        });
        tree.action.locks && tree.action.locks.forEach(function(devState) {
            var vDev = self.controller.devices.get(devState.device);
            if (vDev) {
                vDev.performCommand(devState.status);
            }
        });
        tree.action.scenes && tree.action.scenes.forEach(function(scene) {
            var vDev = self.controller.devices.get(scene);
            if (vDev) {
                vDev.performCommand("on");
            }
        });
    }
};

SecurityModeCustom.prototype.op = function (dval, op, val) {
    if (op === "=") {
        return dval === val;
    } else if (op === "!=") {
        return dval !== val;
    } else if (op === ">") {
        return dval > val;
    } else if (op === "<") {
        return dval < val;
    } else if (op === ">=") {
        return dval >= val;
    } else if (op === "<=") {
        return dval <= val;
    }
        
    return null; // error!!  
};
