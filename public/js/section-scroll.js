document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("section").forEach(section => {
    const ul = section.querySelector(".inner");
    if (!ul) return; // Skip if no .inner element
    
    const items = ul.querySelectorAll("li");
    if (items.length === 0) return; // Skip if no items
    
    const leftBtn = section.querySelector(".l-btn");
    const rightBtn = section.querySelector(".r-btn");
    if (!leftBtn || !rightBtn) return; // Skip if no navigation buttons
    
    let currentIndex = 0;

    if (items.length <= 1) {
      leftBtn.style.display = "none";
      rightBtn.style.display = "none";
    }

    function updateScroll() {
      ul.scrollTo({
        left: items[currentIndex].offsetLeft,
        behavior: 'smooth'
      });
    }

    leftBtn.addEventListener("click", () => {
      currentIndex = (currentIndex - 1 + items.length) % items.length;
      updateScroll();
    });

    rightBtn.addEventListener("click", () => {
      currentIndex = (currentIndex + 1) % items.length;
      updateScroll();
    });
  });
});
