// Global controller to manage ScrollMagic lifecycle
let scrollMagicController = null;
let scrollMagicInitializing = false;
let scrollMagicInitTimeout = null;

function initFrontPageAdsScrollEffects() {
  console.log('initFrontPageAdsScrollEffects: Called');
  
  // Check if required dependencies are loaded
  if (typeof $ === 'undefined' || typeof jQuery === 'undefined') {
    console.warn('initFrontPageAdsScrollEffects: jQuery not loaded yet, deferring initialization');
    setTimeout(initFrontPageAdsScrollEffects, 100);
    return;
  }
  
  if (typeof ScrollMagic === 'undefined') {
    console.warn('initFrontPageAdsScrollEffects: ScrollMagic not loaded yet, deferring initialization');
    setTimeout(initFrontPageAdsScrollEffects, 100);
    return;
  }
  
  // Prevent multiple simultaneous initializations
  if (scrollMagicInitializing) {
    console.log('initFrontPageAdsScrollEffects: Already initializing, skipping...');
    return;
  }
  
  // Clear any pending initialization
  if (scrollMagicInitTimeout) {
    clearTimeout(scrollMagicInitTimeout);
    scrollMagicInitTimeout = null;
  }
  
  scrollMagicInitializing = true;
  
  // Debounce initialization to ensure DOM is fully ready
  scrollMagicInitTimeout = setTimeout(() => {
    console.log('initFrontPageAdsScrollEffects: Starting delayed initialization');
    
    try {
      // Destroy existing controller if it exists
      if (scrollMagicController) {
        console.log('initFrontPageAdsScrollEffects: Destroying old controller');
        try {
          scrollMagicController.destroy(true);
          scrollMagicController = null;
        } catch (error) {
          console.warn('initFrontPageAdsScrollEffects: Error destroying controller:', error);
        }
      }

      // Create new controller
      scrollMagicController = new ScrollMagic.Controller({
        globalSceneOptions: {
          triggerHook: 'onLeave'
        }
      });

      // Only process sections that exist and have valid properties
      let processedCount = 0;
      const sections = $("section");
      console.log('initFrontPageAdsScrollEffects: Found', sections.length, 'sections');
      
      sections.each(function() {
        // Check if element exists and is still in the DOM
        if (!this || !document.body.contains(this)) {
          console.log('initFrontPageAdsScrollEffects: Skipping detached section');
          return;
        }
        
        // Skip if element doesn't have required properties
        if (!this.offsetParent && this.offsetHeight === 0) {
          console.log('initFrontPageAdsScrollEffects: Skipping hidden section');
          return;
        }
        
        var name = $(this).attr('id');
        console.log('initFrontPageAdsScrollEffects: Processing section:', name);
        
        try {
          new ScrollMagic.Scene({
            triggerElement: this,
            offset: -80
          })
          .setPin(this)
          .loglevel(3)
          .addTo(scrollMagicController);
          
          processedCount++;
        } catch (error) {
          console.warn('initFrontPageAdsScrollEffects: Error creating scene for section:', name, error);
        }
      });

      console.log('initFrontPageAdsScrollEffects: Successfully processed', processedCount, 'sections');

      // Add the class toggle scene if the element exists
      try {
        var fourSection = document.querySelector("section#four");
        if (fourSection && document.body.contains(fourSection)) {
          var wh = window.innerHeight;
          new ScrollMagic.Scene({
            offset: wh * 3
          })
          .setClassToggle("section#four", "is-active")
          .addTo(scrollMagicController);
        }
      } catch (error) {
        console.warn('initFrontPageAdsScrollEffects: Error creating section#four scene:', error);
      }
      
      console.log('initFrontPageAdsScrollEffects: Initialization complete');
    } catch (error) {
      console.error('initFrontPageAdsScrollEffects: Fatal error during initialization:', error);
    } finally {
      scrollMagicInitializing = false;
      scrollMagicInitTimeout = null;
    }
  }, 200); // 200ms debounce delay
}
