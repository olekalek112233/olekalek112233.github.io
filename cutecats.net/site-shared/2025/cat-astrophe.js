const catImages = [
    "/site-shared/2025/cat-astrophe-kittens/cc0-kitten1.png",
    "/site-shared/2025/cat-astrophe-kittens/cc0-kitten2.png",
    "/site-shared/2025/cat-astrophe-kittens/cc0-kitten3.png",
    "/site-shared/2025/cat-astrophe-kittens/cc0-kitten4.png"
];

const button = document.getElementById("cat-astrophe-btn");

class Cat {
    constructor() {
        const img = document.createElement("img");

        img.src = catImages[Math.floor(Math.random() * catImages.length)];

        img.style.position = "fixed";
        img.style.width = "120px";
        img.style.height = "120px";
        img.style.objectFit = "contain";

        img.style.left = Math.random() * (window.innerWidth - 120) + "px";
        img.style.top = Math.random() * (window.innerHeight - 120) + "px";

        img.style.zIndex = "999999";
        img.style.pointerEvents = "none";

        document.body.appendChild(img);

        // kotek znika po 5 sekundach
        setTimeout(() => {
            img.remove();
        }, 5000);
    }
}

if (button) {
    button.style.display = "block";

    button.addEventListener("click", () => {
        // 10 kotków
        for (let i = 0; i < 10; i++) {
            new Cat();
        }
    });
} else {
    console.error("Nie znaleziono przycisku #cat-astrophe-btn");
}