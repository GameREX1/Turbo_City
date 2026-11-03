export function createControlsModule({ input, keys, world, recoverCar, toggleCamera, pauseGame }) {
  function bindControls() {
    const controlMap={
      KeyW:"gas",ArrowUp:"gas",KeyS:"reverse",ArrowDown:"reverse",
      KeyA:"left",ArrowLeft:"left",KeyD:"right",ArrowRight:"right",
      Space:"brake"
    };
    window.addEventListener("keydown",e=>{
      if(controlMap[e.code]){keys[e.code]=true;e.preventDefault();}
      if(e.code==="KeyR" && world.started)recoverCar();
      if(e.code==="KeyC" && world.started)toggleCamera();
      if(e.code==="Escape" && world.started){pauseGame();e.preventDefault();}
      if(e.code==="Enter" && world.paused){pauseGame(false);e.preventDefault();e.stopPropagation();}
    });
    window.addEventListener("keyup",e=>{if(controlMap[e.code])keys[e.code]=false;});
    window.addEventListener("blur",()=>{
      Object.keys(keys).forEach(k=>keys[k]=false);
      Object.keys(input).forEach(k=>input[k]=false);
    });
    document.querySelectorAll("[data-action]").forEach(btn=>{
      const action=btn.dataset.action;
      const down=e=>{e.preventDefault();if(btn.setPointerCapture)btn.setPointerCapture(e.pointerId);input[action]=true;btn.classList.add("active");};
      const up=e=>{e.preventDefault();input[action]=false;btn.classList.remove("active");};
      btn.addEventListener("pointerdown",down);
      btn.addEventListener("pointerup",up);
      btn.addEventListener("pointercancel",up);
      btn.addEventListener("lostpointercapture",up);
    });
  }
  
  function readInput() {
    return {
      gas:!!(keys.KeyW||keys.ArrowUp||input.gas),
      brake:!!(keys.Space||input.brake),
      reverse:!!(keys.KeyS||keys.ArrowDown||input.reverse),
      left:!!(keys.KeyA||keys.ArrowLeft||input.left),
      right:!!(keys.KeyD||keys.ArrowRight||input.right)
    };
  }
  
  
  return { bindControls, readInput };
}
