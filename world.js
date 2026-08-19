planck.Settings.lengthUnitsPerMeter = 40;

class World {
    constructor() {
        const GRAVITY = 1000;
        this.physicsWorld = new planck.World({
            gravity: planck.Vec2(0, GRAVITY), // TODO tweak, 600?
            allowSleep: true,
        });
        this.objs = [];

        this.physicsWorld.on("begin-contact", (contact) => {
            let objA = contact.getFixtureA().getBody().getUserData().obj;
            let objB = contact.getFixtureB().getBody().getUserData().obj;
            if(objA === g.plr.body) g.plr.body.onCollisionInSubstep(objB);
            if(objB === g.plr.body) g.plr.body.onCollisionInSubstep(objA);
        });
    }

    clear() { // Doesn't destroy player
        /*
        editSel = [];
        */
        for(let obj of this.objs.slice()) {
            if(obj.type !== "player") obj.destroy();
        }
    }

    getObjFromClickPoint(x, y) { // in reverse order so objects that are in front are picked first
        for(let i = this.objs.length-1; i >= 0; i--) {
            if(this.objs[i].testPoint(x, y) && this.objs[i].type !== "player")
                return this.objs[i];
        }
        return null;
    }
    _unusedUntestedGetConstraintFromClickPoint(x, y) {
        let joint = this.physicsWorld.getJointList();
        while(joint) {
            if(joint instanceof planck.DistanceJoint || joint instanceof planck.RopeJoint) {
                // Check if point is within rectangle at joint with height 2*margin
                const margin = 4;
                let pos1 = joint.getLocalAnchorA();
                let pos2 = joint.getLocalAnchorB();
                let transformed = [x - pos1.x, ypos1.y];
                let unit = [pos2.x - pos1.x, pos2.y - pos1.y];
                unit = [unit[0] / Math.hypot(...unit), unit[1] / Math.hypot(...unit)];
                transformed = [unit[0] * transformed[0] - unit[1] * transformed[1], unit[1] * transformed[0] + unit[0] * transformed[1]]; // unit * transformed.x + (-unit.y, unit.x) * transformed.y
                if(transformed[0] >= 0 && transformed[0] <= Math.hypot(pos2.x - pos1.x, pos2.y - pos1.y) && Math.abs(transformed[1]) <= margin) {
                    return joint;
                }
            } else throw new Error("Unknown joint type in constraintsToOptions");

            joint = joint.getNext();
        }
        return null;
    }

    old_constraintsToOptions() {
        let joint = this.physicsWorld.getJointList();
        let arr = [];
        while(joint) {
            if(joint instanceof planck.DistanceJoint) {
                let anchorA = joint.getLocalAnchorA();
                let anchorB = joint.getLocalAnchorB();
                arr.push({ type: "rod", indA: this.objs.indexOf(joint.getBodyA().getUserData().obj), indB: this.objs.indexOf(joint.getBodyB().getUserData().obj), lx1: anchorA.x, ly1: anchorA.y, lx2: anchorB.x, ly2: anchorB.y });
            } else if(joint instanceof planck.RopeJoint) {
                let anchorA = joint.getLocalAnchorA();
                let anchorB = joint.getLocalAnchorB();
                arr.push({ type: "rope", indA: this.objs.indexOf(joint.getBodyA().getUserData().obj), indB: this.objs.indexOf(joint.getBodyB().getUserData().obj), lx1: anchorA.x, ly1: anchorA.y, lx2: anchorB.x, ly2: anchorB.y });
            } else throw new Error("Unknown joint type in constraintsToOptions");

            joint = joint.getNext();
        }
        return arr;
    }
}



const ObjTypes = {

};
const validObjType = (type) => typeof type === "string" && Object.hasOwn(ObjTypes, type);
function registerObjType(name, objClass) {
    assert(!Object.hasOwn(ObjTypes, name), "Duplicate object type registered: " + name);
    ObjTypes[name] = objClass;
}
function createObj(options) {
    assert(validObjType(options.type), "createObj(): Unknown object type: " + options.type);
    Object.assign(options, { type: options.type, myClass: ObjTypes[options.type] });
    let obj = new ObjTypes[options.type](options);
    return obj;
}



// The idea is that properties can be dynamically added or removed by the object depending on other properties,
// for example a boolean to enable a certain sub-table to be configurable, or object-variant-specific properties.
// subwritabletable props cannot be set directly (to another table), and it is an error to do so, but their properties can be set.
// We also use properties to serialize and deserialize for saving/loading levels
const PROPERTY_TYPES = ["string", "stringEnum", "number", "boolean", "subwritabletable"];
class PropertiesTable {
    constructor() {
        this.handlers = [];
    }

    list() {
        const props = this._listProperties();
        assert(Array.isArray(props));
        for(let prop of props) {
            assert(typeof prop.name === "string");
            assert(typeof prop.type === "string" && PROPERTY_TYPES.includes(prop.type), "invalid prop type: " + prop.type);
            if(prop.type === "stringEnum")
                assert(Array.isArray(prop.values) && prop.values.every(val => typeof val === "string"));
        }
        return props;
    }
    validateValue(propTypeObj, val, isReadOperation) {
        if(propTypeObj.type === "subwritabletable" && !isReadOperation) return false; // We cannot directly change subwritabletables
        if(propTypeObj.type === "string" && typeof val !== "string") return false;
        if(propTypeObj.type === "stringEnum" && (typeof val !== "string" || !propTypeObj.values.includes(val))) return false;
        if(propTypeObj.type === "number" && typeof val !== "number") return false;
        if(propTypeObj.type === "boolean" && typeof val !== "boolean") return false;
        return true;
    }
    set(k, v) {
        assert(typeof k === "string");
        let propTypeObj = this.list().find(p => p.name === k);
        assert(propTypeObj, "unknown property on this obj: " + k);
        assert(this.validateValue(propTypeObj, v, false), "invalid prop value for property " + k);
        this._setProperty(k, v);
    }
    get(k) {
        assert(typeof k === "string");
        let propTypeObj = this.list().find(p => p.name === k);
        assert(propTypeObj, "unknown property on this obj: " + k);
        const v = this._getProperty(k);
        assert(this.validateValue(propTypeObj, v, true), "invalid prop value for property " + k);
        return v;
    }

    // Unchecked functions that invoke the handlers
    _listProperties() {
        return this.handlers.flatMap(h => h.list());
    }
    _getProperty(k) {
        return this.handlers.find(h => h.list().some(prop => prop.name === k)).get(k);
    }
    _setProperty(k, v) {
        this.handlers.find(h => h.list().some(prop => prop.name === k)).set(k, v);
    }

    handler({ list, get, set }) { // register a handler for some properties
        assert(list && get && set);
        this.handlers.push({ list, get, set });
    }

    serialize() {
        let obj = {};
        for(let prop of this.list()) {
            if(prop.type === "subwritabletable") {
                obj[prop.name] = this.get(prop.name).serialize();
            } else obj[prop.name] = this.get(prop.name);
        }
        return obj;
    }
}

class Obj {
    constructor(options) {
        assert(validObjType(options.type));
        this.type = options.type;
        assert(options.myClass);
        this.myClass = options.myClass;

        this.props = new PropertiesTable();
        this.props.handler({
            list: () => {
                return [
                    { name: "x", type: "number" },
                    { name: "y", type: "number" },
                    { name: "angle", type: "number" },
                ];
            },
            get: (k) => {
                if(k === "x") return this.x;
                else if(k === "y") return this.y;
                else if(k === "angle") return this.angle;
                else throw new Error();
            },
            set: (k, v) => {
                if(k === "x") this.x = v;
                else if(k === "y") this.y = v;
                else if(k === "angle") this.angle = v;
                else throw new Error();
            },
        });
        this.options = options; // TODO remove

        g.world.objs.push(this);
    }
    serialize() {
        return { type: this.type, props: this.props.serialize() };
    }

    get x() { throw new Error("get x not implemented for this worldobject"); }
    get y() { throw new Error("get y not implemented for this worldobject"); }
    get angle() { throw new Error("get angle not implemented for this worldobject"); }
    set x(value) { throw new Error("set x not implemented for this worldobject"); }
    set y(value) { throw new Error("set y not implemented for this worldobject"); }
    set angle(value) { throw new Error("set angle not implemented for this worldobject"); }

    testPoint(x, y) {
        throw new Error("testpoint not implemented for this worldobject");
    }

    update() {
        // do nothing by default
    }
    draw() {
        throw new Error("draw not implemented for this worldobject");
    }
    destroy() {
        g.plr.editMode.registerDestroyedObj(this);
        for(let i = 0; i < g.world.objs.length; i++) {
            if(g.world.objs[i] === this) {
                g.world.objs.splice(i, 1);
                i--;
            }
        }
    }


}


// TODO weld?
class Constraint extends Obj {
    constructor(options) {
        super(options);

        this.variant = "rod";
        this.joint = null;
        this._createJoint(this.variant, options.objA, options.objB, 0, 0, 0, 0);

        this.props.handler({
            list: () => {
                return [
                    { name: "variant", type: "stringEnum", values: ["rod", "rope"] },
                    { name: "x2", type: "number" },
                    { name: "y2", type: "number" },
                ];
            },
            get: (k) => {
                if(k === "variant") return this.variant;
                else if(k === "x2") return this.x2;
                else if(k === "y2") return this.y2;
                else throw new Error();
            },
            set: (k, v) => {
                if(k === "variant") {
                    this.variant = v;
                    let posA = this.objA.body.getLocalPoint(planck.Vec2(this.x, this.y));
                    let posB = this.objB.body.getLocalPoint(planck.Vec2(this.x2, this.y2));
                    this._createJoint(this.variant, this.objA, this.objB, posA.x, posA.y, posB.x, posB.y);
                }
                else if(k === "x2") this.x2 = v;
                else if(k === "y2") this.y2 = v;
                else throw new Error();
            },
        });
    }
    _createJoint(variant, objA, objB, x1, y1, x2, y2) {
        if(this.joint) {
            g.world.physicsWorld.destroyJoint(this.joint);
            this.joint = null;
        }

        let jointClass;
        if(variant === "rope") {
            jointClass = planck.RopeJoint;
        } else if(variant === "rod") {
            jointClass = planck.DistanceJoint;
        } else throw new Error("Unknown joint type in _createJoint: " + variant);

        this.objA = assert(objA);
        this.objB = assert(objB);
        let jointOptions = {
            bodyA: assert(this.objA.body),
            bodyB: assert(this.objB.body),
            localAnchorA: planck.Vec2(x1, y1),
            localAnchorB: planck.Vec2(x2, y2),
            collideConnected: true,
        };
        let worldPoint1 = this.objA.body.getWorldPoint(planck.Vec2(x1, y1));
        let worldPoint2 = this.objB.body.getWorldPoint(planck.Vec2(x2, y2));
        if(variant === "rope") jointOptions.maxLength = Math.hypot(worldPoint1.x - worldPoint2.x, worldPoint1.y - worldPoint2.y);
        this.joint = jointClass(jointOptions);
        g.world.physicsWorld.createJoint(this.joint);
    }

    get x() { return this.joint.getAnchorA().x; }
    get y() { return this.joint.getAnchorA().y; }
    get x2() { return this.joint.getAnchorB().x; }
    get y2() { return this.joint.getAnchorB().y; }
    set x(value) { let anchorA = this.objA.body.getLocalPoint(planck.Vec2(value, this.joint.getAnchorA().y)); let anchorB = this.joint.getLocalAnchorB(); this._createJoint(this.variant, this.objA, this.objB, anchorA.x, anchorA.y, anchorB.x, anchorB.y); }
    set y(value) { let anchorA = this.objA.body.getLocalPoint(planck.Vec2(this.joint.getAnchorA().x, value)); let anchorB = this.joint.getLocalAnchorB(); this._createJoint(this.variant, this.objA, this.objB, anchorA.x, anchorA.y, anchorB.x, anchorB.y); }
    set x2(value) { let anchorA = this.joint.getLocalAnchorA(); let anchorB = this.objB.body.getLocalPoint(planck.Vec2(value, this.joint.getAnchorB().y)); this._createJoint(this.variant, this.objA, this.objB, anchorA.x, anchorA.y, anchorB.x, anchorB.y); }
    set y2(value) { let anchorA = this.joint.getLocalAnchorA(); let anchorB = this.objB.body.getLocalPoint(planck.Vec2(this.joint.getAnchorB().x, value)); this._createJoint(this.variant, this.objA, this.objB, anchorA.x, anchorA.y, anchorB.x, anchorB.y); }
    get angle() { return 0; }
    set angle(value) { return; }

    testPoint(x, y) {
        console.log("TODO testPoint constraint");
        return false;
    }
    drawOutline(color) {
        throw new Error("TODO drawOutline constraint");
    }
    draw() {
        let anchorA = this.joint.getAnchorA();
        let anchorB = this.joint.getAnchorB();

        if(this.variant === "rope") {
            g.canv.ctx.strokeStyle = "#884400";
        } else if(this.variant === "rod") {
            g.canv.ctx.strokeStyle = "#888888";
        } else throw new Error("Unknown joint this.variant in drawJoint: " + this.variant);
        g.canv.ctx.lineWidth = 4;
        g.canv.ctx.beginPath();
        g.canv.ctx.moveTo(anchorA.x, anchorA.y);
        g.canv.ctx.lineTo(anchorB.x, anchorB.y);
        g.canv.ctx.stroke();
    }

    destroy() {
        super.destroy();
        throw new Error("TODO destroy constraint");
    }
}
registerObjType("constraint", Constraint);


class PhysicsObj extends Obj {

    static createSimpleShapeBody({ obj, shape: shapeOptions, physicsType, angularVelocity, friction }) {
        angularVelocity ??= 0;
        physicsType ??= "static";
        friction ??= 0.4;
        let shape = assert(shapeOptions);
        let body = g.world.physicsWorld.createBody({
            userData: { obj: assert(obj) },
            position: planck.Vec2(0, 0),
            angle: 0,
            type: assert(physicsType),
            angularVelocity,
        });
        PhysicsObj.createSimpleShapeFixture({ body, shape, friction });
        return body;
    }
    static createSimpleShapeFixture({ body, shape, friction }) {
        const area = PhysicsObj.getSimpleShapeArea(shape);
        const mass = Math.max(Math.min(area / (20*20*3.1415926), 1), 0.2); // we will use mass of area if its less than plr mass, otherwise plr mass (1)
        let density = 1 / area * mass;
        let fixture = body.createFixture({
            shape: PhysicsObj.createSimpleShape(shape),
            density: isFinite(density) ? density : 0,
            friction,
        });
        return fixture;
    }
    reshapeSimpleShape(shape) { // TODO keep constraints somehow?
        this.shape = shape;
        const friction = this.body.getFixtureList().getFriction();
        this.body.destroyFixture(this.body.getFixtureList());
        PhysicsObj.createSimpleShapeFixture({ body: this.body, shape, friction });
    }
    static createSimpleShape(shapeOptions) {
        if(shapeOptions.type === "box") {
            return new planck.Box(
                assert_num(shapeOptions.w) / 2,
                assert_num(shapeOptions.h) / 2,
            );
        } else if(shapeOptions.type === "ball") {
            return new planck.Circle(
                planck.Vec2(0, 0),
                assert_num(shapeOptions.r),
            );
        } else throw new Error("Unknown shape type in createShape: " + shapeOptions.type);
    }
    static getSimpleShapeArea(shapeOptions) {
        if(shapeOptions.type === "box") {
            return assert_num(shapeOptions.w) * assert_num(shapeOptions.h);
        } else if(shapeOptions.type === "ball") {
            return Math.PI * assert_num(shapeOptions.r) * shapeOptions.r;
        } else throw new Error("Unknown shape type in getArea: " + shapeOptions.type);
    }
    static renderSimpleShape(shapeOptions, x, y, angle) {
        if(shapeOptions.type === "box") {
            g.canv.ctx.translate(x, y);
            g.canv.ctx.rotate(angle);
            g.canv.ctx.fillRect(-shapeOptions.w / 2, -shapeOptions.h / 2, shapeOptions.w, shapeOptions.h);
            g.canv.ctx.setTransform.apply(g.canv.ctx, g.canv.camTransform);
        } else if(shapeOptions.type === "ball") {
            g.canv.ctx.beginPath();
            g.canv.ctx.arc(x, y, shapeOptions.r, 0, 2 * Math.PI);
            g.canv.ctx.fill();
        } else throw new Error("shapeType render not implemented: " + shapeOptions.type);
    }
    static renderSimpleShapeOutline(shapeOptions, x, y, angle) {
        if(shapeOptions.type === "box") {
            g.canv.ctx.translate(x, y);
            g.canv.ctx.rotate(angle);
            g.canv.ctx.strokeRect(-shapeOptions.w / 2, -shapeOptions.h / 2, shapeOptions.w, shapeOptions.h);
            g.canv.ctx.setTransform.apply(g.canv.ctx, g.canv.camTransform);
        } else if(shapeOptions.type === "ball") {
            g.canv.ctx.beginPath();
            g.canv.ctx.arc(x, y, shapeOptions.r, 0, 2 * Math.PI);
            g.canv.ctx.stroke();
        } else throw new Error("shapeType render not implemented: " + shapeOptions.type);
    }
    renderMySimpleShape(color) {
        g.canv.ctx.fillStyle = color;
        PhysicsObj.renderSimpleShape(this.shape, this.x, this.y, this.angle);
    }
    renderMySimpleShapeOutline(color) {
        g.canv.ctx.strokeStyle = color;
        PhysicsObj.renderSimpleShapeOutline(this.shape, this.x, this.y, this.angle);
    }
    initSimpleShape() {
        this.shape ??= { type: "box", w: 0, h: 0 };
        let shapePropsTable = new PropertiesTable();
        this.props.handler({
            list: () => {
                return [
                    { name: "shape", type: "subwritabletable" },
                ];
            },
            get: (k) => {
                if(k === "shape") return shapePropsTable;
                else throw new Error();
            },
            set: (k, v) => {
                throw new Error();
            },
        });
        shapePropsTable.handler({
            list: () => {
                let arr = [
                    // initPriority is used in loadLevel and makes sure we set type before w/h or r, otherwise we may get an error if the order happens to be wrong
                    { name: "type", type: "stringEnum", values: ["box", "ball"], initPriority: 1 },
                ];
                if(this.shape.type === "box") {
                    arr.push(
                        { name: "w", type: "number"},
                        { name: "h", type: "number"},
                    );
                } else if(this.shape.type === "ball") {
                    arr.push(
                        { name: "r", type: "number"},
                    );
                }
                return arr;
            },
            get: (k) => {
                if(k === "type") return this.shape.type;
                else if(k === "w" && this.shape.type === "box") return this.shape.w;
                else if(k === "h" && this.shape.type === "box") return this.shape.h;
                else if(k === "r" && this.shape.type === "ball") return this.shape.r;
                else throw new Error();
            },
            set: (k, v) => {
                if(k === "type") {
                    if(this.shape.type !== v) {
                        if(v === "box")
                            this.shape = { type: "box", w: 0, h: 0 };
                        else if(v === "ball")
                            this.shape = { type: "ball", r: 0 };
                        else throw new Error("Unknown shape type");
                    }
                }
                else if(k === "w" && this.shape.type === "box") this.shape.w = v;
                else if(k === "h" && this.shape.type === "box") this.shape.h = v;
                else if(k === "r" && this.shape.type === "ball") this.shape.r = v;
                else throw new Error();
                this.reshapeSimpleShape(this.shape);
            },
        });

    }


    constructor(options) {
        super(options);
        this.body = null; // set by subclass
    }

    get x() { return this.body.getPosition().x; }
    get y() { return this.body.getPosition().y; }
    set x(value) { this.body.setPosition(planck.Vec2(value, this.body.getPosition().y)); }
    set y(value) { this.body.setPosition(planck.Vec2(this.body.getPosition().x, value)); }
    get angle() { return this.body.getAngle(); }
    set angle(value) { this.body.setAngle(value); }

    setPosition(x, y) {
        this.body.setPosition(planck.Vec2(x, y));
    }
    setVelocity(x, y) {
        this.body.setLinearVelocity(planck.Vec2(x, y));
    }
    clearVelocity() {
        this.body.setLinearVelocity(planck.Vec2(0, 0)); // TODO check if this resets angular velocity
    }
    getVelocity() {
        return this.body.getLinearVelocity();
    }
    applyForce(x, y) {
        this.body.applyForceToCenter(planck.Vec2(x, y));
    }
    testPoint(x, y) {
        let fixture = this.body.getFixtureList();
        while(fixture) {
            if(fixture.testPoint(planck.Vec2(x, y))) return true;
            fixture = fixture.getNext();
        }
        return false;
    }

    drawOutline(color) {
        this.renderMySimpleShapeOutline(color);
    }
    draw() {
        throw new Error("draw not implemented");
    }

    destroy() {
        super.destroy();
        g.world.physicsWorld.destroyBody(this.body);
    }
};


registerObjType("player", class extends PhysicsObj {
    constructor(options) {
        super(options);
        this.shape = { type: "ball", r: 20 };
        this.initSimpleShape();
        this.body = PhysicsObj.createSimpleShapeBody({ obj: this, shape: this.shape, physicsType: "dynamic", friction: 0 });
    }

    update() {
        super.update();
        this.touchedLavaLastFrame = false;
    }
    draw() { this.renderMySimpleShape("#8888ff"); }
    onCollisionInSubstep(obj) {
        if(obj.type === "lava") this.touchedLavaLastFrame = true;
    }
});
registerObjType("solid", class extends PhysicsObj {
    constructor(options) {
        super(options);
        this.initSimpleShape();
        this.body = PhysicsObj.createSimpleShapeBody({ obj: this, shape: this.shape, physicsType: "static" });
    }
    draw() { this.renderMySimpleShape("#606060"); }
});
registerObjType("box", class extends PhysicsObj {
    constructor(options) {
        super(options);
        this.initSimpleShape();
        this.body = PhysicsObj.createSimpleShapeBody({ obj: this, shape: this.shape, physicsType: "dynamic" });
    }
    draw() { this.renderMySimpleShape("orange"); }
});
registerObjType("lava", class extends PhysicsObj {
    constructor(options) {
        super(options);
        this.initSimpleShape();
        this.body = PhysicsObj.createSimpleShapeBody({ obj: this, shape: this.shape, physicsType: "static" });
    }
    draw() { this.renderMySimpleShape("red"); }
});
registerObjType("rotator", class extends PhysicsObj {
    constructor(options) {
        super(options);
        this.initSimpleShape();
        this.body = PhysicsObj.createSimpleShapeBody({ obj: this, shape: this.shape, physicsType: "kinematic", angularVelocity: 0.04*60 });
    }
    draw() { this.renderMySimpleShape("#33ccff"); }
});
