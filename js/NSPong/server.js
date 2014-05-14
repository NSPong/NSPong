/*
 * NSPong
 * Copyright (c) 2014 Sampsa Sarjanoja, Tuomas Seppänen, Sakari Alapuranen
 */

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
require("./NSPongApp.js");
require("./NSPongConstants.js");
require("./NSPongEntity.js");
require("./PaddleEntity.js");
require("./NSPongServerGame.js");

// Global variables and game initialization

var game = null;
function createGame() {
    game = new DemoBox2D.DemoServerGame();
    game.startGameClock();
}
createGame();

var nsp = new NSP({
    host: 'localhost',
    port: 8080,
    username: 'admin',
    password: 'secret',
    domain: 'domain',
    push_url: 'http://localhost:4004/events'
});

nsp.accel_axis = 'xy';

// A loop for keeping endpoints up to date
setInterval(function(){
    if (!nsp.push_url_set || !nsp.online) {
        nsp.setNotificationPushURL();
    }
    else if (nsp.online) {
        nsp.updateEndpoints();
        util.log('Endpoints:');
        util.log(util.inspect(nsp.endpoints, {depth: null}));
    }
}, 5000);

// Called when a board has been registered to NSP
nsp.on('endpoint_metadata_changed', function(ep) {
    nsp.callEndpoint(ep.name, '/buzz', 'beep');
    nsp.callEndpoint(ep.name, '/lcd', 'info');
    setTimeout(function(){nsp.callEndpoint(ep.name, '/led', 'reset');}, 30);

    if (Object.keys(game.players).length <= 2) {
        for (var i in ep.meta) {
            var resource = ep.meta[i];
            if (resource.uri == '/acc') {
                nsp.callEndpoint(ep.name, resource.uri, nsp.accel_axis);
                nsp.subscribeEndpoint(ep.name, resource.uri);
            }
            else if (resource.uri == '/joy') {
                nsp.subscribeEndpoint(ep.name, resource.uri);
            }
        }
    }
});

game.emitter.on('reset_lcd', function(name) {
    nsp.callEndpoint(name, '/lcd', 'info');
    nsp.callEndpoint(name, '/led', 'reset');
});

game.emitter.on('init_new_game', function() {
    setTimeout(createGame, 100);
});

game.emitter.on('buzz_paddle', function(name) {
    nsp.callEndpoint(name, '/buzz', 'beep');
    setTimeout(function(){nsp.callEndpoint(name, '/led', 'paddle');}, 30);
});

game.emitter.on('player_scored', function(name) {
    util.log(name + ' scored!');
    nsp.callEndpoint(name, '/buzz', 'score');
    setTimeout(function(){nsp.callEndpoint(name, '/led', 'score');}, 30);
});

game.emitter.on('player_won', function(name) {
    util.log(name + ' won!');
    nsp.callEndpoint(name, '/buzz', 'win');
    setTimeout(function(){nsp.callEndpoint(name, '/led', 'win');}, 30);
});

game.emitter.on('player_lost', function(name) {
    util.log(name + ' lost!');
    setTimeout(function(){nsp.callEndpoint(name, '/led', 'reset');}, 30);
});

game.emitter.on('player_added', function(name, playernumber) {
    nsp.callEndpoint(name, '/lcd', playernumber);
    setTimeout(function(){nsp.callEndpoint(name, '/led', 'reset');}, 30);
});

// HTTP server for receiving NSP notifications and serving files
var http_server = express();
var server = http.createServer(http_server);
var port = process.env.PORT || 4004;
server.listen(port);
util.log('Express listening on port '+port);

http_server.get('/', function(req, res) {
    var index = path.join(path.dirname(path.dirname(__dirname)), 'NSPong.html');
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

        if ('registrations' in data) {
            //util.log('Express :: event update :');
            //console.log(util.inspect(data, {depth: null}));
            for (var i in data.registrations) {
                var ep = data.registrations[i];
                var existing = nsp.getEndpoint(ep.ep);
                if (existing) {
                    nsp.removeEndpoint(ep.ep);
                }
            }
        }

        for (var i in data.notifications) {
            var path = data.notifications[i].path;
            var buf = new Buffer(data.notifications[i].payload, 'base64');
            var name = data.notifications[i].ep;
            if (path == '/acc') {
                var acc = buf.toString().split(';');
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

            }
            else if (path == '/joy') {
                var joy = buf.toString().trim();
                if (joy == "fire off") {
                    if (Object.keys(game.players).length < 2) {
                        var playerFound = false;
                        for (var player in game.players) {
                            if (player == name) {
                                playerFound = true;
                                break;
                            }
                        }
                        if (!playerFound) {
                            game.addBoard(name);
                            nsp.callEndpoint(name, '/buzz');
                        }
                    }
                }
            }
        }

        res.end();
    });
});

