(() => {
    const btn = document.querySelector("#cat-astrophe-btn");
    if(btn == null)
        return;
    btn.style.display = "block";

    const catImages = ["/site-shared/2025/cat-astrophe-kittens/cc0-kitten1.png", "/site-shared/2025/cat-astrophe-kittens/cc0-kitten2.png", "/site-shared/2025/cat-astrophe-kittens/cc0-kitten3.png", "/site-shared/2025/cat-astrophe-kittens/cc0-kitten4.png"];

    let width = window.innerWidth;
    let height = window.innerHeight;

    window.addEventListener("resize", () => {
        width = window.innerWidth;
        height = window.innerHeight;
    });



    class Cat {
        static GRAVITY = 0.7;

        constructor() {

            // Position and angle
            this.x = width/2;
            this.y = height/2;
            this.angle = Math.random()*360;

            // Speed
            let explodeDir = Math.random()*Math.PI*2;
            const EXPLODE_SPEED = 15;
            this.vx = Math.cos(explodeDir)*EXPLODE_SPEED;
            this.vy = Math.sin(explodeDir)*EXPLODE_SPEED;
            this.vangle = 0;

            // Create IMG
            this.elem = document.createElement("img");
            this.w = 50; // Cat size
            this.elem.style.height = this.w+"px";

            this.elem.style.position = "fixed";
            this.elem.style.userSelect = "none";
            this.elem.style.pointerEvents = "none";
            this.elem.style.top = "0";
            this.elem.style.left = "0";
            this.elem.src = catImages[Math.floor(Math.random()*catImages.length)]; // Random cat
            document.body.appendChild(this.elem);

            // First update
            this.update();
        }


        update() {

            // Tornado
            if(Date.now()/1000 % 10 < 5) {
                let dx = (this.x - width/2) / 100, dy = (this.y - height/2) / 100;
                const WIND_MULT = 12;
                const target_vx = -dy * WIND_MULT + -dx*10;
                const target_vy = dx * WIND_MULT + -dy*10;
                this.vx += (target_vx - this.vx) * 0.05;
                this.vy += (target_vy - this.vy) * 0.05;
                this.vangle += 0.1;
            }

            // Cat Physics
            this.vy += Cat.GRAVITY;
            this.x += this.vx;
            this.y += this.vy;
            this.angle += this.vangle;

            // Screen edge bouncing
            const BOUNCE_LOSS = 0.9;
            if(this.y + this.w/2 > height) {
                this.y = height - this.w/2;
                this.vy = -Math.abs(this.vy)*BOUNCE_LOSS;
                this.vangle = Math.random()*10;
            }
            if(this.x + this.w/2 > width) {
                this.x = width - this.w/2;
                this.vx = -Math.abs(this.vx)*BOUNCE_LOSS;
                this.vangle = Math.random()*10;
            }
            if(this.x - this.w/2 < 0) {
                this.x = this.w/2;
                this.vx = Math.abs(this.vx)*BOUNCE_LOSS;
                this.vangle = Math.random()*10;
            }
            if(this.y - this.w/2 < 0) {
                this.y = this.w/2;
                this.vy = Math.abs(this.vy)*BOUNCE_LOSS;
                this.vangle = Math.random()*10;
            }

            // Update the element
            this.elem.style.transform = `translate(calc(${this.x}px - 50%), calc(${this.y}px - 50%)) rotate(${this.angle}deg)`;
        }
    }

    let cats = [];

    btn.addEventListener("click", () => {
        for(let i=0; i<10; i++) {
            cats.push(new Cat());
        }
    });


    // Update loop
    let lastUpdateTime = Date.now()/1000;
    const TARGET_FRAME_TIME = 1/60;
    function update() {
        const currTime = Date.now()/1000;

        if(currTime > lastUpdateTime + TARGET_FRAME_TIME) {
            lastUpdateTime = Math.max(lastUpdateTime + TARGET_FRAME_TIME, currTime - TARGET_FRAME_TIME);

            // Update
            for(let cat of cats) {
                cat.update();
            }
        }
        requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
})();
