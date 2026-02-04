const APP = {
deferredInstall: null,
  init() {

    
    if ('serviceWorker' in navigator) {
    
      //listen for `beforeinstallprompt` event
      window.addEventListener('beforeinstallprompt', (ev) => {
        // Prevent the mini-infobar from appearing on mobile
        ev.preventDefault();
        // Stash the event so it can be triggered later.
        APP.deferredInstall = ev;

        //Apple Styles HIDE BUTTON IF INSTALLED
        //document.getElementById("appleMessage").classList.remove('appleInstallHide');
        if (window.location.pathname === "/") {
          document.getElementById('btn_install1').classList.remove('hide');
        // Your homepage-specific code here
        }
        
        //IOS SUB BTN INFO
        const iOSCanInstall = 'standalone' in window.navigator;
        const iOSIsInstalled = window.navigator.standalone === true;
        if(iOSIsInstalled){
          document.getElementById('btn_SubInfo').classList.add('hide');
        }else if(iOSCanInstall){
          document.getElementById('btn_SubInfo').classList.remove('hide');
        }
        // Update UI notify the user they can install the PWA
        // if you want here...
        
      });

      //EVENT LISTENER FOR INSTALL BTN
      if (window.location.pathname === "/") {
          document.getElementById('btn_install1').addEventListener('click', APP.startChromeInstall);
        // Your homepage-specific code here
      }
      
      

      
      
    }//END SERVICE WORKER CHECK
    
    // Initialize slideshow if it exists on the page
    APP.initSlideshow();
  },//END INIT

  startChromeInstall() {
    if (APP.deferredInstall) {
      APP.deferredInstall.prompt();
      APP.deferredInstall.userChoice.then((choice) => {
        if (choice.outcome == 'accepted') {
          //they installed
          document.getElementById("btn_install1").classList.add('hide');
          //document.getElementById("btn_install2").classList.add('hide');
          //document.getElementById("btn_install3").classList.add('hide');
        } else {
        }
      });
    }
  },

  // Slideshow functionality
  slideshow: {
    currentSlideIndex: 0,
    slideInterval: null,
    
    init() {
      const slideshowContainer = document.querySelector('.slideshow-container');
      if (!slideshowContainer) {
        return;
      }
      
      // Start auto-play
      this.startAutoPlay();
      
      // Add event listeners for hover pause/resume
      slideshowContainer.addEventListener('mouseenter', () => this.pauseAutoPlay());
      slideshowContainer.addEventListener('mouseleave', () => this.startAutoPlay());
    },
    
    showSlide(index) {
      const slides = document.querySelectorAll('.slide');
      const dots = document.querySelectorAll('.dot');
      
      // Handle looping logic
      if (index >= slides.length) {
        this.currentSlideIndex = 0;
      } else if (index < 0) {
        this.currentSlideIndex = slides.length - 1;
      } else {
        this.currentSlideIndex = index;
      }
      
      // Hide all slides and remove active class from dots
      slides.forEach(slide => slide.classList.remove('active'));
      dots.forEach(dot => dot.classList.remove('active'));
      
      // Show current slide and activate current dot
      slides[this.currentSlideIndex].classList.add('active');
      dots[this.currentSlideIndex].classList.add('active');
      
    },
    
    changeSlide(direction) {
      const newIndex = this.currentSlideIndex + direction;
      this.showSlide(newIndex);
      this.resetInterval();
    },
    
    currentSlide(index) {
      this.currentSlideIndex = index - 1;
      this.showSlide(this.currentSlideIndex);
      this.resetInterval();
    },
    
    resetInterval() {
      clearInterval(this.slideInterval);
      this.startAutoPlay();
    },
    
    startAutoPlay() {
      this.slideInterval = setInterval(() => {
        this.changeSlide(1);
      }, 5000); // Change slide every 5 seconds
    },
    
    pauseAutoPlay() {
      clearInterval(this.slideInterval);
    },
    
  },
  
  initSlideshow() {
    // Initialize slideshow if it exists
    const slideshowContainer = document.querySelector('.slideshow-container');
    if (slideshowContainer) {
      this.slideshow.init();
    }
  },

};//END CONST APP
document.addEventListener('DOMContentLoaded', APP.init);

// Global slideshow functions for onclick handlers
function changeSlide(direction) {
  APP.slideshow.changeSlide(direction);
}

function currentSlide(index) {
  APP.slideshow.currentSlide(index);
}


function expandAppMenu() {
    try {
      var subBtnItems = document.getElementById("SubBtnItems");
      if(!subBtnItems || !subBtnItems.classList) {
        console.warn('SubBtnItems element not found or missing classList');
        return;
      }
      
      // Check if it's an Apple device (iOS)
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const iOSIsInstalled = window.navigator.standalone === true;
      
      if(subBtnItems.classList.contains('hide')){
        subBtnItems.classList.remove('hide');
        
        // Always reset to first slide when opening
        if(typeof showAppleMsg === 'function') {
          showAppleMsg(0); // Show first step
        }
        
        // If it's iOS and not installed, show Apple instructions
        if(isIOS && !iOSIsInstalled) {
          var appleMessage = document.getElementById("appleMessage");
          if(appleMessage && appleMessage.classList) {
            appleMessage.classList.remove('appleInstallHide');
          }
        }
      } else {
        subBtnItems.classList.add('hide');
        
        // Hide Apple message when closing
        var appleMessage = document.getElementById("appleMessage");
        if(appleMessage && appleMessage.classList) {
          appleMessage.classList.add('appleInstallHide');
        }
      }
    } catch(error) {
      console.error('Error in expandAppMenu:', error);
    }
  }

function showAppleMsg(x) {
    var msg = document.getElementsByClassName("msg");
    for (var i = msg.length - 1; i >= 0; i--) {
      if(x==i){
        msg[i].classList.remove('hide');
      }else{
        msg[i].classList.add('hide');
      }
      
    }
  }

  function toggleDashboard(){
    var dashboard = document.getElementById("dashboard");
    if(dashboard.classList.contains('loader-hide-left')){
      dashboard.classList.remove('loader-hide-left');
    }else{
      dashboard.classList.add('loader-hide-left');
    }
  }
  
  function closeDashboard(){
    var dashboard = document.getElementById("dashboard");
    dashboard.classList.add('loader-hide-left');
  }

  function toggleDelivery(ele){
    if(ele.nextElementSibling.classList.contains('hide')){
      ele.nextElementSibling.classList.remove('hide');
    }else{
      ele.nextElementSibling.classList.add('hide');
    }
  }
  
  function closeDelivery(){
    var fooddrop = document.getElementById("fooddropBtn");
    fooddrop.classList.add('hide');
  }

  // Function to reload app.js functionality after DOM changes
  function reloadAppJS() {
    console.log('reloadAppJS called');
    
    // Re-check PWA install capability
    if ('serviceWorker' in navigator) {
      // Check if install button should be shown/hidden
      if (window.location.pathname === "/") {
        const installBtn = document.getElementById('btn_install1');
        const subInfoBtn = document.getElementById('btn_SubInfo');
        
        if (installBtn) {
          // Hide install button if PWA is already installed
          if (window.matchMedia('(display-mode: standalone)').matches || 
              window.navigator.standalone === true) {
            installBtn.classList.add('hide');
          } else {
            installBtn.classList.remove('hide');
          }
        }
        
        if (subInfoBtn) {
          // Handle iOS install button visibility
          const iOSCanInstall = 'standalone' in window.navigator;
          const iOSIsInstalled = window.navigator.standalone === true;
          if (iOSIsInstalled) {
            subInfoBtn.classList.add('hide');
          } else if (iOSCanInstall) {
            subInfoBtn.classList.remove('hide');
          }
        }
      }
    }
    
    // Re-initialize slideshow if it exists
    if (APP.slideshow) {
      const slideshowContainer = document.querySelector('.slideshow-container');
      if (slideshowContainer && !slideshowContainer.hasAttribute('data-slideshow-initialized')) {
        slideshowContainer.setAttribute('data-slideshow-initialized', 'true');
        APP.slideshow.init();
      }
    }
  }
