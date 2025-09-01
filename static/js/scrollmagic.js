function initFrontPageAdsScrollEffects() {
  var ctrl = new ScrollMagic.Controller({
    globalSceneOptions: {
      triggerHook: 'onLeave'
    }
  });

  $("section").each(function() {
    var name = $(this).attr('id');
    new ScrollMagic.Scene({
      triggerElement: this,
      offset: -80
    })
    .setPin(this)
    .loglevel(3)
    .addTo(ctrl);
    // .addIndicators({
    //   colorStart: "rgba(255,255,255,0.5)",
    //   colorEnd: "rgba(255,255,255,0.5)", 
    //   colorTrigger : "rgba(255,255,255,1)",
    //   name: name
    // })
  });

  var wh = window.innerHeight;
  new ScrollMagic.Scene({
    offset: wh * 3
  })
  .setClassToggle("section#four", "is-active")
  .addTo(ctrl);
}
