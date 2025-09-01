function initAOS() {
  AOS.init();
  console.log("AOS init");
}

document.addEventListener("DOMContentLoaded", function () {
  initAOS();
});

document.addEventListener("barba:after", function () {
  AOS.refreshHard(); // Reinitialize AOS after a page transition
  console.log("AOS refreshHard");
});

window.addEventListener("scroll", () => {
  AOS.refresh();
});
