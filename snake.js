if (typeof Emitter === "undefined") {
	if (typeof window !== "undefined") {
		console.log("looks like script is running in browser. check Emitter(https://github.com/ystskm/browser-emitter-js/blob/master/Emitter.js) dependency");
	}
	var Emitter = require("browser-emitter");
}

if (typeof WebSocket === "undefined") {
	var WebSocket = require("ws");
}

'use strict';

class Ids {

    constructor(snake) {
        this.ids = {};
        this.snake = snake;

        snake.emit("new.ids", this);
    }

    update(arr) {
        if (typeof arr === "undefined") return;
        for (let i = 0; i < arr.length; i++) {
            const ii = arr[i];
            this.ids[ii.id] = ii
        }
        this.snake.emit("id.updated", this);
    };

    get(id) {
        return this.ids[id];
    }
}

class SnakeMap {
    constructor(snake, r, c) {
        this.snake = snake;
        this.rows = r;
        this.columns = c;
        this.map = [];
        for (let i = 0; i < this.rows; i++) {
            this.map[i] = [];
            for (let j = 0; j < this.columns; j++) {
                this.map[i][j] = {color: "white"};
            }
        }

        this.snake.emit("new.map", this);
    }

    update(arr) {
        for (let i = 0; i < arr.length; i++) {
            const event = arr[i];
            const {x, y} = event;
            const old = this.map[y][x];
            if (old.time && event.time && event.time <= old.time) continue;
            this.map[y][x] = event;
            this.snake.emit("cell.update", x, y, event, old);
        }
    }
}

class Snake {

    constructor() {
        Emitter.call(this);
        this.running = false;
        this.connection = 0;

        this.ids = new Ids(this);
        this.map = new SnakeMap(this, 0, 0);

        this.on("ws.close", this.reconnect);
        this.on("onmessage", this.onMessage);
    }

    start() {
        this.running = true;
        this.reconnect();
    }

    stop() {
        this.running = false;
        if (this.ws) this.ws.close();
    }

    connectTo(server) {
        this.server = server;
        this.start();
    }

    reconnect() {
        this.connection = 0;
        if (!this.running) {
            return false;
        }

        this.emit("reconnect");

        console.log("trying to connect to " + this.server);
        this.ws = new WebSocket(this.server);
        this.ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            this.emit("onmessage", msg);
        };
        this.ws.onclose = () => {
            this.connection = 0;
            console.log("connection closed");
            this.emit("ws.close");
        };
        this.ws.onopen = () => {
            this.connection = 1;
            console.log("connection established");
            this.emit("ws.open", this.ws);
        };

        return true;
    }

    onMessage(msg) {
        const parseCellInfo = (info) => {
            const obj = {};
            const pos1 = info.indexOf('.');
            const pos2 = info.indexOf('#');
            let pos3 = info.indexOf('*');
            if (pos3 != -1) {
                obj.points = parseInt(info.slice(pos3 + 1));
            } else {
                pos3 = info.length;
            }
            obj.x = parseInt(info.slice(0, pos1)); //server.y
            obj.y = parseInt(info.slice(pos1 + 1, pos2)); //server.x
            obj.id = info.slice(pos2 + 1, pos3);
            obj.info = this.ids.get(obj.id);
            obj.color = obj.info.color;
            return obj;
        };

        if (msg.act == "init") {
            let {rows, columns} = msg;
            console.log(`Server map size: ${rows} ${columns}`);

            this.ids = new Ids(this);
            this.map = new SnakeMap(this, rows, columns);

            this.emit("init");
        }
        this.emit("id.update", msg.u);
        this.ids.update(msg.u);

        const sarr = msg.a;
        if (typeof sarr === "undefined") return;

        const arr = sarr.split("|");
        const events = [];
        for (let i = 0; i < arr.length; i++) {
            events.push(parseCellInfo(arr[i]));
        }
        this.map.update(events);
        this.emit("map.update", events);
    }

    join(nick) {
        if (this.connection == 0) return;
        this.ws.send(JSON.stringify({act: "join", "nick": nick}));
        this.emit("join", nick);
    }

    leave() {
        if (this.connection == 0) return;
        this.ws.send(JSON.stringify({act: "leave"}));
        this.emit("leave");
    }

    go(dir) {
        this.ws.send(JSON.stringify({act: "turn", "dir": dir}));
        this.emit("go", dir);
    }
}

Emitter.inherits(Snake);

if (module) {
	module.exports = Snake;
}