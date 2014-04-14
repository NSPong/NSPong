/*
 * NSP API access library
 */

var util = require('util'),
    http = require('http'),
    events = require('events');

// Constructor
var NSP = function(options) {
    this.nsp_config = {
        host: options.host,
        port: options.port,
        username: options.username,
        password: options.password,
        // Currently only one domain in one NSP host supported,
        // but multiple instances of same NSP host can be used
        // for multiple domains.
        domain: options.domain,
        push_url: options.push_url
    };

    this.default_http_options = {
        method: 'GET',
        host: this.nsp_config.host,
        port: this.nsp_config.port,
        headers: {
            'Authorization': 'Basic ' + new Buffer(this.nsp_config.username + ':' + this.nsp_config.password).toString('base64')
        }
    };

    this.online = false;
    this.push_url_set = false;
    this.endpoints = [];
    this.subscriptions = [];

    // Update also metadata when updating endpoints
    this.on('endpoints_changed', this.updateEndpointMetadata);
};

NSP.prototype = new events.EventEmitter;
module.exports = NSP;

// Private library functions

var g_request_number = 1;

NSP.prototype._NSPHttpReq = function(options, body, callback, args) {
    if (typeof options === 'undefined') options = {};
    var self = this;
    var request_number = g_request_number++;

    // Copy default values
    var http_options = {};
    for (var field in self.default_http_options) {
        if (typeof self.default_http_options[field] === 'object') {
            http_options[field] = {};
            for (var subfield in self.default_http_options[field])
                http_options[field][subfield] = self.default_http_options[field][subfield];
        }
        else
            http_options[field] = self.default_http_options[field];
    }

    // Apply given options
    for (var field in options) {
        if (typeof options[field] === 'object') {
            for (var subfield in options[field]) {
                http_options[field][subfield] = options[field][subfield];
            }
        }
        else if (field == 'path') {
            http_options[field] = '/'+self.nsp_config.domain+options[field];
        }
        else {
            http_options[field] = options[field];
        }
    }

    util.log(util.format('-%d- Requesting with options:', request_number));
    console.log(util.inspect(http_options, {depth: null}));
    if (body)
        console.log(body);

    var req = http.request(http_options, function(res) {
        res.setEncoding('utf8');

        var received_body = '';
        res.on('data', function(chunk) {
            received_body += chunk;
        });

        res.on('end', function() {
            self.online = true;

            util.log(util.format('-%d- Received %d, body:', request_number, res.statusCode));
            console.log(received_body);

            if (res.statusCode == 401) {
                util.log('NSP authentication failed!');
            }
            else {
                callback(received_body, res, args);
            }
        });
    });

    if (body)
        req.write(body);

    req.on('error', function(err) {
        self.online = false;
        self.push_url_set = false;
        util.log('Connection to NSP failed ['+err.message+']');
    });

    req.end();
    return req;
}

// Public library functions

NSP.prototype.getEndpoint = function(name) {
    for (var i in this.endpoints)
        if (this.endpoints[i].name == name)
            return this.endpoints[i];

    return null;
}

NSP.prototype.updateEndpoints = function() {
    var self = this;
    var options = {
        path: '/endpoints',
        headers: {
            'Content-Type': 'application/json'
        }
    };

    var req = self._NSPHttpReq(options, null, function(body) {
        try {
            var data = JSON.parse(body);
        }
        catch (err) {
            util.error('Could not parse JSON: '+err.message);
            util.error('Body was: ');
            util.error(body);
            return;
        }

        var something_changed = false;

        // Check if new endpoints
        for (var i in data) {
            var is_new = true;

            for (var j in self.endpoints) {
                if (data[i].name == self.endpoints[j].name) {
                    is_new = false;

                    // Put metadata in place
                    if (typeof self.endpoints[j].meta !== 'undefined')
                        data[i].meta = self.endpoints[j].meta;

                    break;
                }
            }

            something_changed |= is_new;
        }

        // Check if removed endpoints
        for (var j in self.endpoints) {
            var is_removed = true;

            for (var i in data) {
                if (data[i].name == self.endpoints[j].name) {
                    is_removed = false;
                    break;
                }
            }

            something_changed |= is_removed;
        }

        if (something_changed) {
            self.endpoints = data;
            util.log('endpoints_changed emitted');
            self.emit('endpoints_changed', data);
        }
    });
}

NSP.prototype.updateEndpointMetadata = function() {
    var self = this;

    for (var i in self.endpoints) {

        var ep = self.endpoints[i];

        if (typeof ep.meta === 'undefined') {
            util.log('Requesting endpoint metadata for: '+ep.name);

            var options = {
                path: '/endpoints/'+ep.name,
                headers: {
                    'Content-Type': 'application/json'
                }
            };

            var req = self._NSPHttpReq(options, null, function(body, res, endpoint) {
                try {
                    var data = JSON.parse(body);
                }
                catch (err) {
                    util.error(err.message);
                    return;
                }

                endpoint.meta = data;

                util.log('endpoint_metadata_changed emitted');
                self.emit('endpoint_metadata_changed', endpoint);
            }, ep);
        }
    }
}

NSP.prototype.getSubscriptions = function() {
    var options = {
        path: '/subscriptions',
        headers: {
            'Content-Type': 'application/json'
        }
    };

    var req = this._NSPHttpReq(options, null, function(body) {});
}

NSP.prototype.subscribeEndpoint = function(name, uri) {
    var self = this;
    var ep = this.getEndpoint(name);

    if (ep && typeof ep.meta !== 'undefined') {
        for (var i in ep.meta) {
            var resource = ep.meta[i];
            if (typeof resource.uri !== 'undefined' && resource.uri == uri) {

                var options = {
                    method: 'PUT',
                    path: '/subscriptions/'+ep.name+uri,
                };
                var req = this._NSPHttpReq(options, null, function(body, res){
                    if (res.statusCode == 200) {
                        util.log('Successfully subscribed: '+ep.name+uri);
                        util.log('endpoint_subscribed emitted');
                        self.emit('endpoint_subscribed', ep.name, uri);
                    }
                    else {
                        util.log('Subscribing failed for: '+ep.name+uri);
                    }
                });
            }
        }
    }
}

NSP.prototype.setNotificationPushURL = function() {
    var self = this;
    var options = {
        method: 'PUT',
        path: '/notification/push-url',
        headers: {
            'Content-Type': 'text/uri-list'
        }
    };

    var body = this.nsp_config.push_url;

    var req = this._NSPHttpReq(options, body, function(received_body, res) {
        if (res.statusCode == 204) {
            self.push_url_set = true;
            util.log('NSP notifications push URL updated');
        }
        else {
            self.push_url_set = false;
            util.log('Setting push url failed: returned code '+res.statusCode);
        }
    });
}

NSP.prototype.callEndpoint = function(name, uri, body) {
    var ep = this.getEndpoint(name);

    var options = {
        'method': 'PUT',
        'path': '/endpoints/'+ep.name+uri,
        'headers': {
            'Content-Type': 'text/plain'
        }
    };
    var req = this._NSPHttpReq(options, body, function(){});
}

