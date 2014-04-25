/**
 File:
 server.js
 Created By:
 Mario Gonzalez
 Project:
 RealtimeMultiplayerNodeJS
 Abstract:
 This is the base server module for starting RealtimeMultiplayerGame
 Basic Usage:
 node server.js
 Version:
 1.0
 */

var util = require('util');
var http = require('http');
var path = require('path');
var express = require('express');
var BOX2D = require("./lib/box2d.js");
var NSP = require("./lib/nsp.js");

require("../lib/SortedLookupTable.js");
require("../core/RealtimeMutliplayerGame.js");
require("../model/Point.js");
require("../lib/circlecollision/Circle.js");
require("../lib/circlecollision/CircleManager.js");
require("../model/Constants.js");
require("../model/NetChannelMessage.js");
require("../controller/FieldController.js");
require("../core/AbstractGame.js");
require("../network/Client.js");
require("../network/ServerNetChannel.js");
require("../core/AbstractServerGame.js");
require("../model/GameEntity.js");
require("../model/WorldEntityDescription.js");
require("../input/Keyboard.js");

//require("v8-profiler");
require("./DemoBox2DApp.js");
require("./DemoBox2DConstants.js");
require("./DemoBox2DEntity.js");
require("./PaddleEntity.js");
require("./DemoBox2DServerGame.js");

var game = new DemoBox2D.DemoServerGame();
game.startGameClock();

var nsp = new NSP({
    host: 'localhost',
    port: 8080,
    username: 'admin',
    password: 'secret',
    domain: 'domain',
    push_url: 'http://localhost:4004/events'
});

nsp.accel_axis = 'xy';

setInterval(function(){
    if (!nsp.push_url_set) {
        nsp.setNotificationPushURL();
    }
    nsp.updateEndpoints();
    util.log('Endpoints:');
    util.log(util.inspect(nsp.endpoints, {depth: null}));
}, 5000);

nsp.on('endpoint_metadata_changed', function(ep) {
    if (Object.keys(game.players).length <= 2) {
        for (var i in ep.meta) {
            var resource = ep.meta[i];
            if (resource.uri == '/acc') {
                nsp.callEndpoint(ep.name, resource.uri, nsp.accel_axis);
                nsp.subscribeEndpoint(ep.name, resource.uri);
            }
        }
    }
});

nsp.on('endpoint_subscribed', function(name, uri) {
    nsp.callEndpoint(name, '/buzz');
    game.addBoard(name, uri);
});

game.emitter.on('buzz_paddle', function(name) {
    nsp.callEndpoint(name, '/buzz');
    //1, 2, 3, 4 string values allowed
    nsp.callEndpoint(name, '/led', '2');
});

game.emitter.on('player_added', function(name, playernumber) {
    nsp.callEndpoint(name, '/lcd', playernumber);
});

// HTTP server for receiving NSP notifications and serving files
var http_server = express();
var server = http.createServer(http_server);
var port = process.env.PORT || 4004;
server.listen(port);
util.log('Express listening on port '+port);

http_server.get('/', function(req, res) {
    var index = path.join(path.dirname(path.dirname(__dirname)), 'DemoBox2DApp.html');
    util.log(util.format('Express :: Trying to load %s', index));
    res.sendfile(index);
});

//This handler will listen for requests on /*, any file from the root of our server.
//See expressjs documentation for more info on routing.
http_server.get('/*', function(req, res, next) {

    //This is the current file they have requested
    var file = req.params[0];

    //For debugging, we can track what files are requested.
    util.log('Express :: file requested : ' + file);

    //Send the requesting client the file.
    res.sendfile(path.join(path.dirname(path.dirname(__dirname)), file));
});

// NSP event handler
http_server.put('/events', function(req, res, next) {

    var body = '';
    req.setEncoding('utf8');
    req.on('data', function(chunk){
        body += chunk;
    });

    req.on('end', function(){

        try {
            var data = JSON.parse(body);
        }
        catch (err) {
            res.statusCode = 400;
            return res.end('Error: ' + err.message);
        }

        //util.log('Express :: event update :');
        //console.log(util.inspect(data, {depth: null}));

        for (var i in data.notifications) {
            var buf = new Buffer(data.notifications[i].payload, 'base64');
            var acc = buf.toString().split(';');
            var name = data.notifications[i].ep;

            var accel_data = {};
            for (var j in acc) {
                var axis = nsp.accel_axis[j];
                if (typeof axis !== 'undefined') {
                    acc[j] = parseFloat(acc[j]);
                    if (!isNaN(acc[j]))
                        accel_data[axis] = acc[j];
                }
            }

            if (Object.keys(accel_data).length > 0)
                game.updatePlayer(name, accel_data);

            /*
            game.fieldController.getEntities().forEach(function (key, entity) {
                var body = entity.getBox2DBody();
                var bodyPosition = body.GetPosition();
                //var angle = Math.atan2(pos.y - bodyPosition.y, pos.x - bodyPosition.x);
                var force = x;
                var impulse = new BOX2D.b2Vec2(0 * force, 1 * force);
                //body.ApplyImpulse(impulse, bodyPosition);
            }, game);
            */
        }

        res.end();
    });
});

