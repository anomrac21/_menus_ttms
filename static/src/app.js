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
        console.log('saved the install event');

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
  },//END INIT

  startChromeInstall() {
    if (APP.deferredInstall) {
      console.log(APP.deferredInstall);
      APP.deferredInstall.prompt();
      APP.deferredInstall.userChoice.then((choice) => {
        if (choice.outcome == 'accepted') {
          //they installed
          console.log('installed');
          document.getElementById("btn_install1").classList.add('hide');
          //document.getElementById("btn_install2").classList.add('hide');
          //document.getElementById("btn_install3").classList.add('hide');
        } else {
          console.log('cancel');
        }
      });
    }
  },

};//END CONST APP
document.addEventListener('DOMContentLoaded', APP.init);


function expandAppMenu() {
    var subInfoBtn = document.getElementById("SubInfoBtn");
    var subBtnItems = document.getElementById("SubBtnItems");
    if(subBtnItems.classList.contains('hide')){
      subBtnItems.classList.remove('hide');
      
    }else{
      subBtnItems.classList.add('hide');
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
      console.log('unhide');
    }else{
      ele.nextElementSibling.classList.add('hide');
      console.log('hide');
    }
  }
  
  function closeDelivery(){
    var fooddrop = document.getElementById("fooddropBtn");
    fooddrop.classList.add('hide');
  }

  