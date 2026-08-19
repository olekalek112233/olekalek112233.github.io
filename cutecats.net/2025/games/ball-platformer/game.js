

// TODO: teleporters, constraints/springs/ropes, reset/regen thingies
// TODO: make player movement not slow down if rolling faster than move speed, and then add a fall to level that makes player land on slope getting lot of horizontal speed
// TODO: display error if window onerror maybe?

const TARGET_FPS = 60;


var g;

class Canvas {
    constructor(el) {
        this.el = el;
        this.ctx = this.el.getContext("2d");
        this.width = 0, this.height = 0;
        this.camTransform = [1, 0, 0, 1, 0, 0];
        this.oldCamTransform = this.camTransform;

        this.updateSize();
        window.addEventListener("resize", () => this.updateSize());
        document.body.addEventListener("contextmenu", e => e.preventDefault());
        if(navigator.maxTouchPoints > 0)
            document.querySelector("body").classList.add("is-touch-device");
    }
    updateSize() {
        this.el.width = 0; this.el.height = 0; // Make it work if we resize to smaller size
        this.el.width = this.el.offsetWidth; this.el.height = this.el.offsetHeight;
        this.width = this.el.width; this.height = this.el.height;
    }
}
class Game {
    constructor() {
        g = this;
        this.lockEditMode = location.hostname !== "localhost";

        this.canv = new Canvas(document.querySelector("canvas"));
        this.world = new World();
        this.plr = new Player(this.world);
        this.ws = null;
        this.otherPlayers = new Map();

        if(!this.lockEditMode)
            this.plr.editMode.setActive(true);
        this.loadLevel(LEVELS["1"]);

        const toffx = this.canv.width / 2 - this.plr.body.x, toffy = this.canv.height / 2 - this.plr.body.y;
        this.canv.camTransform = [1, 0, 0, 1, toffx, toffy];


        // Multiplayer
        const connectWs = () => {
            this.ws = new WebSocket("wss://" + location.host + "/2025/games/ball-platformer/ws", ["platformer-game"]);
            this.ws.addEventListener("message", (e) => {
                if(e.data.startsWith("poslist ")) {
                    let myId = Number(e.data.split(" ")[1]);
                    let list = e.data.split(" ")[2].trim().length > 0
                        ? e.data.split(" ")[2].split(":").map(pos => pos.split(",").map(v => Number(v)))
                        : [];
                    for(let [id, x, y, t] of list) {
                        if(myId === id) continue;
                        if(!this.otherPlayers.has(id)) {
                            this.otherPlayers.set(id, {
                                id: id,
                                posHist: [[t, x, y]],
                            });
                        } else {
                            let posHist = this.otherPlayers.get(id).posHist;
                            posHist.push([t, x, y]);
                            if(posHist.length > 1000 / 50) posHist.shift();
                        }
                    }
                    for(let [id, plr] of this.otherPlayers.entries()) {
                        if(!list.some(p => p[0] === id)) {
                            this.otherPlayers.delete(id);
                        }
                    }
                }
            });
        };
        if(this.lockEditMode) {
            connectWs();
            setInterval(() => {
                if(!this.ws || (this.ws.readyState !== WebSocket.OPEN && this.ws.readyState !== WebSocket.CONNECTING)) {
                    this.ws.close();
                    this.ws = null;
                    connectWs();
                }
            }, 10000);
        }
        setInterval(() => {
            if(this.ws && this.ws.readyState === WebSocket.OPEN)
                this.ws.send("pos "+this.plr.body.x+" "+this.plr.body.y+" "+Date.now().toFixed(2));
        }, 50);

        // Frame Loop TODO: make it work if user has device with less than 60hz animations
        let currentFps = 0;
        let frameCount = 0;

        let lastFrame = 0;
        let frameHist = [];
        function frameLoop() {
            if(Date.now() >= lastFrame + 1000/TARGET_FPS) {
                if(lastFrame === 0) lastFrame = Date.now();
                g.update();

                frameHist.push(Date.now());
                if(frameHist.length > 25) frameHist.shift();
                currentFps = frameHist.length >= 2 ? 1000 / ((frameHist.at(-1) - frameHist[0]) / (frameHist.length - 1)) : 0;
                if(!isFinite(currentFps)) currentFps = 0;
                if(frameCount % 5 == 0 || Date.now() - lastFrame > 300)
                    document.title = "Ball Platformer - FPS: " + Math.round(currentFps);

                lastFrame += 1000/TARGET_FPS;
                if(!(lastFrame > Date.now() - 4*1000/TARGET_FPS))
                    lastFrame = Date.now();
                frameCount++;
            }
            requestAnimationFrame(frameLoop);
        }
        frameLoop();

    }

    reset() {
        this.plr.reset();
        this.world.clear();
    }

    // Draw & Update
    update() {

        this.plr.update();
        for(let obj of this.world.objs) {
            obj.update();
        }

        if(!this.plr.editMode.active) {
            this.world.physicsWorld.step(1 / TARGET_FPS, 8, 3);
            this.world.physicsWorld.clearForces();
        }

        this.draw();
    }

    draw() {

        // BG
        this.canv.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.canv.ctx.fillStyle = "#111111";
        this.canv.ctx.fillRect(0, 0, this.canv.width, this.canv.height);



        // objects
        this.canv.ctx.setTransform.apply(this.canv.ctx, this.canv.camTransform);

        // Other players
        this.canv.ctx.fillStyle = "#5555dd";
        for(let [id, plr] of this.otherPlayers.entries()) {
            this.canv.ctx.beginPath();
            let timeDelay = 400; //ms
            let a = plr.posHist.filter(p => p[0] <= Date.now()-timeDelay).at(-1);
            let b = plr.posHist.filter(p => p[0] >= Date.now()-timeDelay)[0];
            //console.log(plr.posHist.filter(p => p[0] <= Date.now()-timeDelay).length, plr.posHist.filter(p => p[0] >= Date.now()-timeDelay).length);
            let renderX, renderY;
            if(!a && !b) {
                renderX = 0, renderY = 0;
            } else if(!a || (b && a === b) || (b && a[0] === b[0])) {
                renderX = b[1], renderY = b[2];
            } else if(!b) {
                renderX = a[1], renderY = a[2];
            } else {
                let fraction = (Date.now()-timeDelay - a[0]) / (b[0] - a[0]);
                renderX = a[1] + fraction*(b[1]-a[1]);
                renderY = a[2] + fraction*(b[2]-a[2]);
            }
            this.canv.ctx.arc(renderX, renderY, 20, 0, 2*Math.PI);
            this.canv.ctx.fill();
        }

        // objs
        for(let obj of this.world.objs) {
            obj.draw();
            /*
            if(mode === "edit" && editSel.includes(obj)) {
                this.canv.ctx.strokeStyle = "#2222ff";
                this.canv.ctx.lineWidth = 3;
                obj.drawOutline();
            }
            */
        }

        /*
        if(mode === "edit" && editStart) {
            let x = Math.min(editStart[0], editCurr[0]), y = Math.min(editStart[1], editCurr[1]);
            let w = Math.max(editStart[0], editCurr[0]) - x, h = Math.max(editStart[1], editCurr[1]) - y;

            if(editMode === "makerect") {
                setStyle(editType);
                this.canv.ctx.fillRect(x, y, w, h);
            } else if(editMode === "makecircle") {
                setStyle(editType);
                this.canv.ctx.beginPath();
                this.canv.ctx.arc(editStart[0], editStart[1], Math.hypot(editCurr[0]-editStart[0], editCurr[1]-editStart[1]), 0, 2 * Math.PI);
                this.canv.ctx.fill();
            } else if(editMode == "makeconstraint") {
                world.drawJoint(constraintEditType, editStart[0], editStart[1], editCurr[0], editCurr[1]);
                
                let currHoverObj = world.getObjFromClickPoint(editCurr[0], editCurr[1]);
                if(currHoverObj && !editSel.includes(currHoverObj)) {
                    currHoverObj.drawOutline();
                }
            } else if(editMode === "select") {
                this.canv.ctx.strokeStyle = "#2222ff";
                this.canv.ctx.lineWidth = 2;
                this.canv.ctx.strokeRect(x, y, w, h);

                this.canv.ctx.lineWidth = 3;
                for(let obj of world.objs)
                    if(obj.type !== "player" && obj.x >= x && obj.y >= y && obj.x < x+w && obj.y < y+h)
                        obj.drawOutline();
            }
        }
        */


        // GUI
        this.canv.ctx.setTransform(1, 0, 0, 1, 0, 0);

        if(this.plr.editMode.active) {
            this.plr.editMode.draw();
            this.canv.ctx.setTransform(1, 0, 0, 1, 0, 0);

        /*
            if(editMode === "makerect") {
                setStyle(editType);
                this.canv.ctx.fillRect(10, height - 50, 40, 40);
            } else if(editMode === "makecircle") {
                setStyle(editType);
                this.canv.ctx.beginPath();
                this.canv.ctx.arc(30, height-30, 20, 0, 2*Math.PI);
                this.canv.ctx.fill();
            } else if(editMode === "makeconstraint") {
                world.drawJoint(constraintEditType, 10, height-50, 50, height-10);
            } else if(editMode === "select") {
                this.canv.ctx.fillStyle = "#2222ff";
                this.canv.ctx.font = "24px sans-serif";
                this.canv.ctx.fillText("Selected: "+editSel.length, 25, height - 25);
            }
        */
        }
    }


    loadLevel(jsonString) {
        this.reset();

        let levelData = JSON.parse(jsonString);
        let objs = levelData.objs;
        let objDataByI = new Map(objs.map((obj, i) => [i, obj]));
        let objCreatedByI = new Map(objs.map((obj, i) => [i, null]));
        for(let [i, data] of objs.entries()) {
            if(levelData.levelDataVersion === "v2") {
                data.props = {};
                for(let [k, v] of Object.entries(data)) {
                    if(k !== "type" && k !== "id" && k !== "props")
                        data.props[k] = v;
                }
            }
            let obj = createObj(structuredClone({ type: data.type }));
            function setProps(table, propsData) {
                // We need to handle initPriority since some properties only appear after others have been set (for example, shape.r)
                let propsToDo = Object.entries(propsData);
                const getPriority = k => table.list().find(p => p.name === k)?.initPriority ?? -Infinity;
                while(propsToDo.length > 0) {
                    let prop = propsToDo.sort((a, b) => {
                        let diff = getPriority(b[0]) - getPriority(a[0]);
                        if(Number.isNaN(diff)) return 0;
                        else return diff;
                    }).shift();
                    let [k, v] = prop;

                    let propObj = table.list().find(p => p.name === k);
                    if(!propObj) throw new Error("prop does not exist but in level data: " + k);
                    if(propObj.type === "subwritabletable")
                        setProps(table.get(k), v);
                    else
                        table.set(k, v);
                }
            }
            if(data.shape) {
                let type = data.shape.type;
                delete data.shape.type;
                data.shape.type = type;
            }
            setProps(obj.props, data.props);
            objCreatedByI.set(i, obj);
        }
        for(let constraint of levelData.constraints) {
            let objA = objCreatedByI.get(levelData.objs.findIndex(o => o.id === constraint.idA));
            let objB = objCreatedByI.get(levelData.objs.findIndex(o => o.id === constraint.idB));
            let obj = createObj({ type: "constraint", objA, objB });
            obj.props.set("variant", constraint.type);
            obj.props.set("x", objA.body.getWorldPoint(planck.Vec2(constraint.lx1, constraint.ly1)).x);
            obj.props.set("y", objA.body.getWorldPoint(planck.Vec2(constraint.lx1, constraint.ly1)).y);
            obj.props.set("x2", objB.body.getWorldPoint(planck.Vec2(constraint.lx2, constraint.ly2)).x);
            obj.props.set("y2", objB.body.getWorldPoint(planck.Vec2(constraint.lx2, constraint.ly2)).y);
        }
    }
    getLevelJSON() {
        return JSON.stringify({
            levelDataVersion: "v3",
            levelSaveTime: Math.round(Date.now()/1000),
            objs: this.world.objs.filter(o => o.type !== "player").map(obj => {
                return obj.serialize();
            }),
            constraints: this.world.constraintsToOptions(),
        }) + "\n";
    }
}


class Player {
    constructor(world) {
        this.world = world;
        this.body = createObj({ type: "player", x: 0, y: -20 });
        this.PLR_VEL = 5*60;
        this.PLR_ACCEL = 4;
        this.PLR_JUMP_VEL = 420;
        this.editMode = new EditMode();

        /*
        // Editing
        let editStart = null;
        let editCurr = null;
        let editType = "solid";
        let editMode = "select"; // makerect, makecircle, select
        let constraintEditType = "rope";
        canv.addEventListener("mousedown", (e) => {
            editCurr = [e.clientX - camTransform[4], e.clientY - camTransform[5]];
            if(mode === "edit") {
                editStart = [e.clientX - camTransform[4], e.clientY - camTransform[5]];
                if(editMode === "makeconstraint") {
                    let obj = world.getObjFromClickPoint(editCurr[0], editCurr[1]);
                    if(obj) editSel = [obj];
                    else editStart = null;
                }
            }
        })
        canv.addEventListener("mouseup", (e) => {
            if(mode === "edit" && editStart) {
                if(editMode === "makerect") {
                    let x = Math.min(editStart[0], editCurr[0]), y = Math.min(editStart[1], editCurr[1]);
                    let w = Math.max(editStart[0], editCurr[0]) - x, h = Math.max(editStart[1], editCurr[1]) - y;
                    if(w >= 5 && h >= 5)
                        createObj({ type: editType, x: x + w / 2, y: y + h / 2, angle: 0, shape: { type: "box", w: w, h: h } });
                } else if(editMode === "makecircle") {
                    let x = editStart[0], y = editStart[1];
                    let r = Math.hypot(editCurr[0] - editStart[0], editCurr[1] - editStart[1]);
                    if(r >= 5)
                        createObj({ type: editType, x: x, y: y, shape: { type: "ball", r: r } });
                } else if(editMode === "makeconstraint" && editSel.length === 1) {
                    let startObj = editSel[0];
                    let endObj = world.getObjFromClickPoint(editCurr[0], editCurr[1]);
                    if(endObj && startObj !== endObj) {
                        startObj.makeJointWorldCoords(constraintEditType, endObj, editStart[0], editStart[1], editCurr[0], editCurr[1]);
                    }
                } else if(editMode === "select") {
                    let x = Math.min(editStart[0], editCurr[0]), y = Math.min(editStart[1], editCurr[1]);
                    let w = Math.max(editStart[0], editCurr[0]) - x, h = Math.max(editStart[1], editCurr[1]) - y;
                    for(let obj of world.objs)
                        if(obj.type !== "player" && !editSel.includes(obj) && obj.x >= x && obj.y >= y && obj.x < x + w && obj.y < y + h)
                            editSel.push(obj);
                }
                editStart = null;
            }
        });
        canv.addEventListener("mousemove", (e) => {
            editCurr = [e.clientX - camTransform[4], e.clientY - camTransform[5]];
        });
        */


        // Keys
        this.keysDown = {};
        this.prevKeysDown = {};
        window.addEventListener("keydown", (e) => {
            this.keysDown[e.key] = true;
            this.keysDown[e.key.toLowerCase()] = true;

            // Edit Mode
            if(e.key === "e" && e.ctrlKey && !g.lockEditMode) {
                this.editMode.setActive(!this.editMode.active);
            }

            /*
            const editModes = ["makerect", "makecircle", "makeconstraint", "select"];
            const constraintEditTypes = ["rope", "rod"];
            if(mode === "edit" && e.key === "t") editMode = editModes[(editModes.indexOf(editMode) + 1) % editModes.length];
            const editTypes = ["solid", "box", "lava", "rotator"];
            if(mode === "edit" && e.key === "r") {
                if(editMode === "makerect" || editMode === "makecircle") editType = editTypes[(editTypes.indexOf(editType) + 1) % editTypes.length];
                if(editMode === "makeconstraint") constraintEditType = constraintEditTypes[(constraintEditTypes.indexOf(constraintEditType) + 1) % constraintEditTypes.length];
            }
            if(mode === "edit" && editMode === "select" && e.key === "Escape") editSel = [];
            if(mode === "edit") {
                /*let target = null;
                for(let obj of objs) {
                    if(obj.type !== "player" && Matter.Vertices.contains(obj.body.vertices, { x: editCurr[0], y: editCurr[1] })) {
                        target = obj;
                    }
                }*/
/*                let speedMult = 1;
                if(keysDown.Shift) speedMult = 5;
                for(let target of editSel) {
                    if(e.key === "Delete") target.destroy();
                    if(e.key.toLowerCase() === "f") target.angle -= (Math.PI/180 * 0.5)*speedMult;
                    if(e.key.toLowerCase() === "g") target.angle += (Math.PI / 180 * 0.5) * speedMult;
                    if(e.key === "ArrowUp") target.y -= speedMult;
                    if(e.key === "ArrowDown" && target) target.y += speedMult;
                    if(e.key === "ArrowLeft" && target) target.x -= speedMult;
                    if(e.key === "ArrowRight" && target) target.x += speedMult;

                }
            }
        */
        });
        window.addEventListener("keyup", (e) => {
            this.keysDown[e.key] = false;
            this.keysDown[e.key.toLowerCase()] = false;
        });

        const updateTouchState = (e) => {
            e.preventDefault(); // I think this is completely disables zooming on ios (double-tapping would still work even with user-select none and touch-action none
            const elems = [
                { el: document.querySelector("#touch-left"), key: "a", pressed: false },
                { el: document.querySelector("#touch-right"), key: "d", pressed: false },
                { el: document.querySelector("#touch-jump"), key: "w", pressed: false },
            ];

            for(let touch of e.touches) {
                const el = document.elementFromPoint(touch.clientX, touch.clientY);
                const item = elems.find(item => item.el === el);
                if(item)
                    item.pressed = true;
            }

            for(let item of elems) {
                this.keysDown[item.key] = item.pressed;
                item.el.classList.toggle("is-being-touched", item.pressed);
            }
        };
        document.querySelector("main").addEventListener("touchstart", updateTouchState);
        document.querySelector("main").addEventListener("touchmove", updateTouchState);
        document.querySelector("main").addEventListener("touchend", updateTouchState);
        document.querySelector("main").addEventListener("touchcancel", updateTouchState);

    }


    die() {
        this.body.setPosition(0, -20);
        this.body.clearVelocity();
    }
    reset() {
        this.body.setPosition(0, -20);
        this.body.clearVelocity();
    }

    update() {

        if(this.body.touchedLavaLastFrame) {
            this.die();
        }
        if(this.body.y > 2000) this.die();


        // Controls
        if(this.keysDown.w /*&& !this.prevKeysDown.w*/ && !this.editMode.active) {
            let isGrounded = false;
            for(let obj of g.world.objs) {
                const checkXoff = obj.type === "rotator" ? 0.2 : 0.7;
                // TODO make property plrCanJumpOn or something, for objects
                if((obj.type === "solid" || obj.type === "box" || obj.type === "rotator") && 
                    (obj.testPoint(this.body.x, this.body.y+this.body.shape.r+1) || 
                    obj.testPoint(this.body.x+this.body.shape.r*checkXoff, this.body.y + this.body.shape.r+1) || 
                    obj.testPoint(this.body.x-this.body.shape.r*checkXoff, this.body.y + this.body.shape.r+1))) {
                    isGrounded = true;
                }
            }
            if(isGrounded)
                this.body.setVelocity(this.body.getVelocity().x, -this.PLR_JUMP_VEL);
        }

        const horiz = (this.keysDown.a ? -1 : 0) + (this.keysDown.d ? 1 : 0);
        if(!this.editMode.active) {
            this.body.applyForce(this.PLR_ACCEL*(horiz*this.PLR_VEL - this.body.getVelocity().x), 0);
        } else if(this.editMode.active) {
            const shiftMult = 5;
            this.body.setPosition(this.body.x + this.PLR_VEL*(1/TARGET_FPS)*horiz*(this.keysDown.Shift ? shiftMult : 1), this.body.y + this.PLR_VEL*(1/TARGET_FPS)*((this.keysDown.w ? -1 : 0) + (this.keysDown.s ? 1 : 0))*(this.keysDown.Shift ? shiftMult : 1));
            this.body.clearVelocity();
        }

        g.canv.oldCamTransform = g.canv.camTransform;
        const toffx = g.canv.width / 2 - this.body.x, toffy = g.canv.height / 2 - this.body.y;
        g.canv.camTransform[4] += 0.3*(toffx - g.canv.camTransform[4]);
        g.canv.camTransform[5] += 0.3*(toffy - g.canv.camTransform[5]);

        if(this.editMode.active)
            this.editMode.update();

        Object.assign(this.prevKeysDown, this.keysDown);
    }

}

class EditMode {
    constructor() {
        this.active = false;
        this.sel = [];

        this.propsPanel = document.querySelector("#props-panel");

        this.mDown = false;
        this.mDownX = 0;
        this.mDownY = 0;
        this.mouseX = 0;
        this.mouseY = 0;
        this.pMouseX = 0;
        this.pMouseY = 0;
        this.canvMouseX = 0;
        this.canvMouseY = 0;
        this.currAction = "none";


        g.canv.el.addEventListener("mousedown", (e) => {
            if(!this.active) return;
            this.mDown = true;
            this.mDownX = this.mouseX;
            this.mDownY = this.mouseY;
            this.mouseDown(this.mouseX, this.mouseY);
        });
        g.canv.el.addEventListener("mouseup", (e) => {
            if(!this.active && this.mDown === false) return;
            this.mouseUp(this.mouseX, this.mouseY);
            this.mDown = false;
        });
        g.canv.el.addEventListener("mousemove", (e) => {
            this.canvMouseX = e.offsetX;
            this.canvMouseY = e.offsetY;
        });

        this.setSel([]);
    }
    setActive(bool) {
        if(this.active === bool) return;
        this.active = bool;

        document.body.classList.toggle("edit-mode", this.active);
    }
    setSel(arr) {
        this.sel = arr;

        if(this.sel.length == 0) {
            this.propsPanel.innerHTML = "<h1>Object Properties (no selection)</h1>";
        } else {
            this.propsPanel.innerHTML = `<h1>Properties of ${this.sel.length} objects</h1>TODO`;
        }
    }
    registerDestroyedObj(obj) { // Called by object class
        if(this.sel.includes(obj))
            this.setSel(this.sel.filter(o => o !== obj));
    }

    mouseDown(x, y) {

    }
    mouseUp(x, y) {
        if(this.currAction === "move") {
            this.currAction = "none";
        } else if(this.currAction === "none" && Math.hypot(x-this.mDownX, y-this.mDownY) < 5) {
            const obj = g.world.getObjFromClickPoint(this.mDownX, this.mDownY);
            if(g.plr.keysDown.Shift || g.plr.keysDown.Control)
                this.setSel(obj ? (this.sel.includes(obj) ? this.sel.filter(o => o !== obj) : [...this.sel, obj]) : this.sel);
            else
                this.setSel(obj ? [obj] : []);
        }
    }
    mouseMove(x, y, dx, dy) {
        if(this.mDown && this.currAction === "none" &&
            this.sel.includes(g.world.getObjFromClickPoint(this.mDownX, this.mDownY)) &&
            Math.hypot(x-this.mDownX, y-this.mDownY) >= 5) {
            this.currAction = "move";
            for(let obj of this.sel) {
                obj.x += x-this.mDownX; // Move them so mDownPos equals mPos
                obj.y += y-this.mDownY;
            }
        } else if(this.currAction === "move") {
            for(let obj of this.sel) {
                obj.x += dx;
                obj.y += dy;
            }
        }
    }

    update() {
        this.pMouseX = this.mouseX;
        this.pMouseY = this.mouseY;
        this.mouseX = Math.floor(this.canvMouseX - g.canv.camTransform[4]);
        this.mouseY = Math.floor(this.canvMouseY - g.canv.camTransform[5]);
        if(this.mouseX !== this.pMouseX || this.mouseY !== this.pMouseY) {
            this.mouseMove(this.mouseX, this.mouseY, this.mouseX - this.pMouseX, this.mouseY - this.pMouseY);
        }

    }
    draw() {

        // World transform
        g.canv.ctx.setTransform.apply(g.canv.ctx, g.canv.camTransform);

        for(let obj of this.sel) {
            g.canv.ctx.strokeStyle = "#2222ff";
            g.canv.ctx.lineWidth = 3;
            obj.drawOutline();
        }

        if(this.currAction === "none") {
            const obj = g.world.getObjFromClickPoint(this.mouseX, this.mouseY);
            if(obj) {
                g.canv.ctx.strokeStyle = "#ffff00";
                g.canv.ctx.lineWidth = 1;
                obj.drawOutline();
            }
        }


        // GUI
        g.canv.ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Help text
        const HELP_TEXT =
            "Edit mode controls:\n" +
            "Ctrl-E - Toggle edit mode\n" +
            "Shift - Fly fast\n" +
            "\n" +
            "\n" +
            "\n";
        g.canv.ctx.fillStyle = "white";
        g.canv.ctx.font = "16px sans-serif";
        for(let [i, line] of HELP_TEXT.split("\n").entries()) {
            g.canv.ctx.fillText(line, 10, 20 + 20*i);
        }
    }
}




function setStyle(type) {
    assert(Object.hasOwn(ObjTypes, type) && ObjTypes[type].color, "Can't setStyle to object type: " + type);
    ctx.fillStyle = ObjTypes[type].color;
}



/*
updateOptionsPanel(mode === "edit");
*/


