/**
 File:
 DemoBox2DServerGame.js
 Created By:
 Mario Gonzalez
 Project:
 DemoBox2D
 Abstract:
 This is a demo of using Box2d.js with RealTimeMultiplayerNode.js
 The box2d.js world creation and other things in this demo, are shamelessly lifted from the https://github.com/HBehrens/box2d.js examples
 Basic Usage:
 demoServerGame = new DemoBox2D.DemoServerGame();
 demoServerGame.startGameClock();
 Version:
 1.0
 */
(function () {
    var util = require('util');
    var events = require('events');
    var BOX2D = require("./lib/box2d.js");

    DemoBox2D.DemoServerGame = function () {
        DemoBox2D.DemoServerGame.superclass.constructor.call(this);

        this.setGameDuration(DemoBox2D.Constants.GAME_DURATION);
        this.setupBox2d();
        return this;
    };

    DemoBox2D.DemoServerGame.prototype = {
        _world: null,
        _velocityIterationsPerSecond: 100,
        _positionIterationsPerSecond: 300,
        players: {},
        game: {},
        acc_buf: [0, 0],
        emitter: new events.EventEmitter(),
        wd_timer: null,

        /**
         * Map RealtimeMultiplayerGame.Constants.CMDS to functions
         * If ServerNetChannel does not contain a function, it will check to see if it is a special function which the delegate wants to catch
         * If it is set, it will call that CMD on its delegate
         */
        setupCmdMap: function () {
            DemoBox2D.DemoServerGame.superclass.setupCmdMap.call(this);
            this.cmdMap[RealtimeMultiplayerGame.Constants.CMDS.PLAYER_UPDATE] = this.shouldUpdatePlayer;
        },

        resetGame: function(reset_score) {
            util.log('Game reset');

            if (reset_score) {
                for (var name in this.players) {
                    this.fieldController.getEntities().forEach(function (key, entity) {
                        if (entity.entityType == DemoBox2D.Constants.ENTITY_TYPES.RECT) {
                            entity.score = 0;
                        }
                    });
                }
            }

            var bodyPosition = new BOX2D.b2Vec2(DemoBox2D.Constants.GAME_WIDTH / 2 - DemoBox2D.Constants.ENTITY_BOX_SIZE,
                                                DemoBox2D.Constants.GAME_HEIGHT / 2 - DemoBox2D.Constants.ENTITY_BOX_SIZE);
            this.ball.SetLinearVelocity(new BOX2D.b2Vec2(0, 0));
            this.ball.SetPosition(bodyPosition);

            var angle = Math.random() * Math.PI/2 - Math.PI/4;
            angle += Math.random() > 0.5 ? 0 : Math.PI;
            var force = 10;
            var impulse = new BOX2D.b2Vec2(Math.cos(angle) * force, Math.sin(angle) * force);
            setTimeout(function(){this.ball.ApplyImpulse(impulse, bodyPosition);}.bind(this), 2000);
            this.resetWatchdog();
        },

        /**
         * Sets up the Box2D world and creates a bunch of boxes from that fall from the sky
         */
        setupBox2d: function () {

            DemoBox2D.Constants.GAME_WIDTH /= DemoBox2D.Constants.PHYSICS_SCALE;
            DemoBox2D.Constants.GAME_HEIGHT /= DemoBox2D.Constants.PHYSICS_SCALE;
            DemoBox2D.Constants.ENTITY_BOX_SIZE /= DemoBox2D.Constants.PHYSICS_SCALE;

            this.createBox2dWorld();
//            this._world.DestroyBody(this._wallTop);

            this.ball = this.createBall(DemoBox2D.Constants.GAME_WIDTH / 2 - DemoBox2D.Constants.ENTITY_BOX_SIZE,
                                        DemoBox2D.Constants.GAME_HEIGHT / 2 - DemoBox2D.Constants.ENTITY_BOX_SIZE,
                                        DemoBox2D.Constants.ENTITY_BOX_SIZE);

/*
            for (var i = 0; i < DemoBox2D.Constants.MAX_OBJECTS; i++) {
                var x = (DemoBox2D.Constants.GAME_WIDTH / 2) + Math.sin(i / 5);
                var y = i * -DemoBox2D.Constants.ENTITY_BOX_SIZE * 3;

                // Make a square or a box
                if (Math.random() < 0.5) this.createBall(x, y, DemoBox2D.Constants.ENTITY_BOX_SIZE);
                else this.createBox(x, y, 0, DemoBox2D.Constants.ENTITY_BOX_SIZE);
            }
*/
        },

        /**
         * Resets the ball position to middle when no paddle hits have occurred in some time.
         */
        resetWatchdog: function() {
            clearTimeout(this.wd_timer);
            this.wd_timer = setTimeout(this.resetGame.bind(this), 20000);
        },

        /**
         * Creates the Box2D world with 4 walls around the edges
         */
        createBox2dWorld: function () {
            var self = this;
            var m_world = new BOX2D.b2World(new BOX2D.b2Vec2(0, 0), true);
            var cl = new BOX2D.b2ContactListener();
            cl.BeginContact = function(contact) {
                var a_c = contact.m_fixtureA.m_filter.categoryBits;
                var a_b = contact.m_fixtureA.m_body;
                var b_c = contact.m_fixtureB.m_filter.categoryBits;
                var b_b = contact.m_fixtureB.m_body;

//                console.log(util.inspect(a_c, {depth:0}), util.inspect(b_c, {depth:0}));
//                console.log(util.inspect(contact, {depth: 0}));

                if ((a_c == 0x08 && b_c == 0x04) || (a_c == 0x04 && b_c == 0x08)) {
                    for (var name in self.players) {
                        if (self.players[name].body == a_b || self.players[name].body == b_b) {
                            self.emitter.emit('buzz_paddle', name);
                            util.log('buzz_paddle emitted: ' + name);
                            self.resetWatchdog();
                            break;
                        }
                    }
                }
                else if ((a_c == 0x01 && b_c == 0x08) || (a_c == 0x08 && b_c == 0x01)) {
                    var emitFunction = function() {
                        var reset_score = false;
                        self.fieldController.getEntities().forEach(function (key, entity) {
                            var body = entity.getBox2DBody();
                            if (body == self.players[name].body) {
                                entity.score++;
                                if (entity.score == 5) {
                                    reset_score = true;
                                    var losing_players = Object.keys(self.players);
                                    var i = losing_players.indexOf(name);
                                    losing_players.splice(i, 1);
                                    self.emitter.emit('player_won', name);
                                    for (var j in losing_players) {
                                        self.emitter.emit('player_lost', losing_players[j]);
                                    }
                                }
                                else {
                                    self.emitter.emit('player_scored', name);
                                }
                            }
                        });
                        setTimeout(function(){this.resetGame(reset_score);}.bind(self), 10);
                    };
                    if (a_b == self._wallLeft || b_b == self._wallLeft) {
                        for (var name in self.players) {
                            if (!self.players[name].left) {
                                emitFunction();
                                break;
                            }
                        }
                    }
                    else if (a_b == self._wallRight || b_b == self._wallRight) {
                        for (var name in self.players) {
                            if (self.players[name].left) {
                                emitFunction();
                                break;
                            }
                        }
                    }
                }
            };
            m_world.SetContactListener(cl);
            m_world.SetWarmStarting(true);

            // Create border of boxes
            var wall = new BOX2D.b2PolygonShape();
            var wallBd = new BOX2D.b2BodyDef();

            // Left
            wallBd.position.Set(-1.5, DemoBox2D.Constants.GAME_HEIGHT / 2);
            wall.SetAsBox(1, DemoBox2D.Constants.GAME_HEIGHT * 10);
            this._wallLeft = m_world.CreateBody(wallBd);
            this._wallLeft.CreateFixture2(wall);
            // Right
            wallBd.position.Set(DemoBox2D.Constants.GAME_WIDTH + 0.55, DemoBox2D.Constants.GAME_HEIGHT / 2);
            wall.SetAsBox(1, DemoBox2D.Constants.GAME_HEIGHT * 10);
            this._wallRight = m_world.CreateBody(wallBd);
            this._wallRight.CreateFixture2(wall);
            // BOTTOM
            wallBd.position.Set(DemoBox2D.Constants.GAME_WIDTH / 2, DemoBox2D.Constants.GAME_HEIGHT + 0.55);
            wall.SetAsBox(DemoBox2D.Constants.GAME_WIDTH / 2, 1);
            this._wallBottom = m_world.CreateBody(wallBd);
            this._wallBottom.CreateFixture2(wall);
            // TOP
            wallBd.position.Set(DemoBox2D.Constants.GAME_WIDTH / 2, -1.5);
            wall.SetAsBox(DemoBox2D.Constants.GAME_WIDTH / 2, 1);
            this._wallTop = m_world.CreateBody(wallBd);
            this._wallTop.CreateFixture2(wall);

            this._world = m_world;
        },

        /**
         * Creates a Box2D circular body
         * @param {Number} x    Body position on X axis
         * @param {Number} y    Body position on Y axis
         * @param {Number} radius Body radius
         * @return {b2Body}    A Box2D body
         */
        createBall: function (x, y, radius) {
            var fixtureDef = new BOX2D.b2FixtureDef();
            fixtureDef.shape = new BOX2D.b2CircleShape(radius);
            // Category 0001, collides with everything except hidden paddle
            fixtureDef.filter.categoryBits = 0x08;
            fixtureDef.filter.maskBits = 0x0f;
            fixtureDef.friction = 0.0;
            fixtureDef.restitution = 1.05;
            fixtureDef.density = 1.0;

            var ballBd = new BOX2D.b2BodyDef();
            ballBd.type = BOX2D.b2Body.b2_dynamicBody;
            ballBd.position.Set(x, y);
            var body = this._world.CreateBody(ballBd);
            body.CreateFixture(fixtureDef);

            // Create the entity for it in RealTimeMultiplayerNodeJS
            var aBox2DEntity = new DemoBox2D.Box2DEntity(this.getNextEntityID(), RealtimeMultiplayerGame.Constants.SERVER_SETTING.CLIENT_ID);
            aBox2DEntity.setBox2DBody(body);
            aBox2DEntity.entityType = DemoBox2D.Constants.ENTITY_TYPES.CIRCLE;

            this.fieldController.addEntity(aBox2DEntity);

            return body;
        },

        /**
         * Creates a Box2D square body
         * @param {Number} x    Body position on X axis
         * @param {Number} y    Body position on Y axis
         * @param {Number} rotation    Body rotation
         * @param {Number} size Body size
         * @return {b2Body}    A Box2D body
         */
        createBox: function (x, y, rotation, size) {
            var bodyDef = new BOX2D.b2BodyDef();
            bodyDef.type = BOX2D.b2Body.b2_dynamicBody;
            bodyDef.position.Set(x, y);
            bodyDef.angle = rotation;

            var body = this._world.CreateBody(bodyDef);
            var shape = new BOX2D.b2PolygonShape.AsBox(size, size);
            var fixtureDef = new BOX2D.b2FixtureDef();
            // Category 0010, collides with everything except hidden paddle
            fixtureDef.filter.categoryBits = 0x02;
            fixtureDef.filter.maskBits = 0x0f;
            fixtureDef.restitution = 0.1;
            fixtureDef.density = 1.0;
            fixtureDef.friction = 1.0;
            fixtureDef.shape = shape;
            body.CreateFixture(fixtureDef);

            // Create the entity for it in RealTimeMultiplayerNodeJS
            var aBox2DEntity = new DemoBox2D.Box2DEntity(this.getNextEntityID(), RealtimeMultiplayerGame.Constants.SERVER_SETTING.CLIENT_ID);
            aBox2DEntity.setBox2DBody(body);
            aBox2DEntity.entityType = DemoBox2D.Constants.ENTITY_TYPES.BOX;

            this.fieldController.addEntity(aBox2DEntity);

            return body;
        },

        /**
         * Creates a Box2D square body
         * @param {Number} x    Body position on X axis
         * @param {Number} y    Body position on Y axis
         * @param {Number} rotation    Body rotation
         * @param {Number} size Body size
         * @return {b2Body}    A Box2D body
         */
        createPaddle: function (x, y, rotation, size_x, size_y, hidden) {
            var bodyDef = new BOX2D.b2BodyDef();
            bodyDef.type = BOX2D.b2Body.b2_dynamicBody;
            bodyDef.position.Set(x, y);
            bodyDef.angle = rotation;

            var body = this._world.CreateBody(bodyDef);
            var shape = new BOX2D.b2PolygonShape.AsBox(size_x, size_y);
            var fixtureDef = new BOX2D.b2FixtureDef();
            if (hidden) {
                // Category 1000, collides with nothing
                fixtureDef.filter.categoryBits = 0xff;
                fixtureDef.filter.maskBits = 0x00;
            } else {
                // Category 0100, collides with everything except hidden paddle
                fixtureDef.filter.categoryBits = 0x04;
                fixtureDef.filter.maskBits = 0x0f;
            }
            fixtureDef.restitution = 0.1;
            fixtureDef.density = 100.0;
            fixtureDef.friction = 0.0;
            fixtureDef.shape = shape;
            body.CreateFixture(fixtureDef);

            // Create the entity for it in RealTimeMultiplayerNodeJS
            var aBox2DEntity = new DemoBox2D.PaddleEntity(this.getNextEntityID(), RealtimeMultiplayerGame.Constants.SERVER_SETTING.CLIENT_ID);
            aBox2DEntity.setBox2DBody(body);
            aBox2DEntity.entityType = DemoBox2D.Constants.ENTITY_TYPES.RECT;
            if (hidden) {
                aBox2DEntity.hidden = 1;
            }
            this.fieldController.addEntity(aBox2DEntity);
            return body;
        },

        updatePlayer: function (name, data) {
            //console.log('updatePlayer ' + name + ' : ' + util.inspect(data));

            if (name in this.players) {
                var body = this.players[name].body;
                var is_left = this.players[name].left;
                var velocity = body.GetLinearVelocity();
                var position = body.GetPosition();
                var new_position = new BOX2D.b2Vec2(position.x, position.y);
                var angle = body.GetAngle();

                for (var axis in data) {
                    var acc = data[axis];

                    if (axis == 'x') {
                        var force = 10;
                        var angle = body.GetAngle();

                        if (angle > Math.PI / 4) {
                            body.SetAngle(Math.PI / 4);
                            body.SetAngularVelocity(0);
                        }
                        else if (angle < -Math.PI / 4) {
                            body.SetAngle(-Math.PI / 4);
                            body.SetAngularVelocity(0);
                        }
                        else {
                            //body.SetAngularVelocity(acc * force);
                            body.SetAngularVelocity(0);
                            var new_angle = (is_left ? 1 : -1) * acc * Math.PI/4;
                            var d = new_angle - angle;
                            if (Math.abs(d) > 0.1)
                                body.SetAngle(new_angle);
                        }
                    }
                    else if (axis == 'y') {
                        var force = 10;
                        velocity.y += acc * force;
                        new_position.y = (((is_left ? -1 : 1) * acc+1)/2 * DemoBox2D.Constants.GAME_HEIGHT + position.y) / 2;
                    }
                    else if (axis == 'z') {
                        var force = 0.5;
                        velocity.x += (acc-1) * force;
                    }
                }

                if ('y' in data || 'x' in data) {
                    //body.SetLinearVelocity(velocity);
                    body.SetLinearVelocity(new BOX2D.b2Vec2(0, 0));
                    var d = new_position.y - position.y;
                    if (Math.abs(d) > 0.3)
                        body.SetPosition(new_position);
                }
            }
        },

        createPrismaticJoint: function (state) {
            var jointDef = new BOX2D.b2PrismaticJointDef();
            jointDef.Initialize(state.bodyA, state.bodyB, state.anchorA, state.axis);
            jointDef.collideConnected = false;
            jointDef.enableLimit = false;
            jointDef.enableMotor = false;
            return this._world.CreateJoint(jointDef);
        },

        createRevoluteJoint: function (state) {
            var revoluteDef = new BOX2D.b2RevoluteJointDef();
            revoluteDef.Initialize(state.bodyA, state.bodyB, state.bodyA.GetWorldCenter());
            revoluteDef.collideConnected = false;
            revoluteDef.enableLimit = false;
            revoluteDef.enableMotor = false;
            return this._world.CreateJoint(revoluteDef);
        },

        addBoard: function (name) {
            var self = this;
            var x, y;
            // Note! x and y are physics scaled, paddle width = 1
            // Paddles are now 0.5 paddle widths from the walls
            if (Object.keys(this.players).length == 0) {
                self.emitter.emit('player_added', name, '1');
                console.log('Placing player 1');
                x = 0.5;
                y = DemoBox2D.Constants.GAME_HEIGHT / 2;
            }
            else if (Object.keys(this.players).length == 1) {
                self.emitter.emit('player_added', name, '2');
                console.log('Placing player 2');
                x = DemoBox2D.Constants.GAME_WIDTH - 1.5;
                y = DemoBox2D.Constants.GAME_HEIGHT / 2;
                self.resetGame();
            }
            else {
                return;
            }

            // Creating a paddle and a hidden "paddle" behind it            
            var body = this.createPaddle(x, y, 0, DemoBox2D.Constants.ENTITY_BOX_SIZE, DemoBox2D.Constants.ENTITY_BOX_SIZE * 3, false);
            var hidden_body = this.createPaddle(x, y, 0, DemoBox2D.Constants.ENTITY_BOX_SIZE, DemoBox2D.Constants.ENTITY_BOX_SIZE * 3, true);
            // Hidden paddle is connected to world body with a prismatic joint
            var prismatic_joint = this.createPrismaticJoint({anchorA: new BOX2D.b2Vec2(x, y), axis: new BOX2D.b2Vec2(0, 1), bodyA: hidden_body, bodyB: this._world.GetGroundBody()});
            // Real paddle is connected to the hidden paddle with a revolute joint
            var revolute_joint = this.createRevoluteJoint({bodyA: hidden_body, bodyB: body});
            this.players[name] = {};
            this.players[name].left = Object.keys(this.players).length == 1;
            this.players[name].body = body;
            this.players[name].prismatic_joint = prismatic_joint;
            this.players[name].revolute_joint = revolute_joint;
            util.log('Added player with endpoint: '+name);
        },

        /**
         * Updates the game
         * Creates a WorldEntityDescription which it sends to NetChannel
         */
        tick: function () {
            var delta = 16 / 1000;
            this.step(delta);

            if (this.gameTick % 30 === 0) {
                this.resetRandomBody();
            }
            // Note we call superclass's implementation after we're done
            DemoBox2D.DemoServerGame.superclass.tick.call(this);
        },

        /**
         * Resets an entity and drops it from the sky
         */
        resetRandomBody: function () {
            // Retrieve a random key, and use it to retreive an entity
            /*
            var allEntities = this.fieldController.getEntities();
            var randomKeyIndex = Math.floor(Math.random() * allEntities._keys.length);
            var entity = allEntities.objectForKey(allEntities._keys[randomKeyIndex]);

            var x = Math.random() * DemoBox2D.Constants.GAME_WIDTH + DemoBox2D.Constants.ENTITY_BOX_SIZE;
            var y = Math.random() * -15;
            entity.getBox2DBody().SetPosition(new BOX2D.b2Vec2(x, y));
            */
        },

        step: function (delta) {
            this._world.ClearForces();
//          var delta = (typeof delta == "undefined") ? 1/this._fps : delta;
            this._world.Step(delta, delta * this._velocityIterationsPerSecond, delta * this._positionIterationsPerSecond);
        },

        shouldAddPlayer: function (aClientid, data) {
//          this.createPlayerEntity( this.getNextEntityID(), aClientid);
        },

        /**
         * @inheritDoc
         */
        shouldUpdatePlayer: function (aClientid, data) {
            var self = this;
            var pos = new BOX2D.b2Vec2(data.payload.x, data.payload.y);
            pos.x /= DemoBox2D.Constants.PHYSICS_SCALE;
            pos.y /= DemoBox2D.Constants.PHYSICS_SCALE;

            // Loop through each entity, retrieve it's Box2D body, and apply an impulse towards the mouse position a user clicked
            this.fieldController.getEntities().forEach(function (key, entity) {
                var body = entity.getBox2DBody();
                var bodyPosition = body.GetPosition();
                var angle = Math.atan2(pos.y - bodyPosition.y, pos.x - bodyPosition.x);
                var force = 20;
                var impulse = new BOX2D.b2Vec2(Math.cos(angle) * force, Math.sin(angle) * force);

                var is_player = false;

                for (name in self.players) {
                    if (body == self.players[name].body) {
                        is_player = true;
                    }
                }

                if (!is_player) {
                    //body.ApplyImpulse(impulse, bodyPosition);
                }
            }, this);

            this.resetGame();
        },

        shouldRemovePlayer: function (aClientid) {
//          DemoBox2D.DemoServerGame.superclass.shouldRemovePlayer.call( this, aClientid );
//          console.log("DEMO::REMOVEPLAYER");
        }
    };

    // extend RealtimeMultiplayerGame.AbstractServerGame
    RealtimeMultiplayerGame.extend(DemoBox2D.DemoServerGame, RealtimeMultiplayerGame.AbstractServerGame, null);
})()
