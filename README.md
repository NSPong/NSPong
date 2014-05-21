__NSPong is a HTML5 demo game developed on top of ARM Sensinode’s NanoService Platform. The game uses for example RealTimeMultiplayerNodeJS, Box2D and CAAT libraries, which are specifically built for HTML5 multiplayer games with the client/server model__

### NOTE!
NSPong is meant to be used with mbed LPC1768 application boards and software from [http://mbed.org/teams/NSPong/code/NS_Game_Controller/](http://mbed.org/teams/NSPong/code/NS_Game_Controller/)

# Video Demo
[https://vimeo.com/95207889](https://vimeo.com/95207889)

# How to use
1. Download this repository
2. Download [Node.js](http://nodejs.org)
3. In the terminal, navigate to the root directory of the repo
4. Run "npm install"
5. Download and unzip NanoService platform from [here](http://silver.arm.com)
6. Run NanoService platform: nsp-devel/bin/runNSP.bat
7. Run "node js/NSPong/server.js"
8. From the browser, open [http://127.0.0.1:4004](http://127.0.0.1:4004)

# Libraries used
* [RealTimeMultiplayerNodeJS](https://github.com/onedayitwillmake/RealtimeMultiplayerNodeJs) - Base for developing a real-time multi-client HTML5 game
* [Node.js](http://nodejs.org/) - An interpreter for running JavaScript on the server side
* [Socket.IO](http://socket.io/) - Provides client-server communication via WebSockets, etc.
* [Express](http://expressjs.com/) - Library for creating HTTP servers easily
* [Box2DJS](http://box2d-js.sourceforge.net/) - Library for realistic 2D physics
* [CAAT](http://labs.hyperandroid.com/static/caat/) - For rendering graphics on the client side
