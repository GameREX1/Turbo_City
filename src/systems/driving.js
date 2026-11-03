import * as THREE from "three";
import { WORLD_LIMIT } from "../config/game.js";

export function createDrivingModule({ world, cars, getCurrentCarIndex, getPlayer, vehicle, getReadInput, toast, damp, clamp, collectStars, $ }) {
  function updatePhysics(dt) {
    const player=getPlayer();
    if(!player)return;
    const currentCarIndex=getCurrentCarIndex();
    const readInput=getReadInput();
    const brakeLights=vehicle.getBrakeLights();
    const vehicleWheels=vehicle.getWheels();
    const playerLight=vehicle.getPlayerLight();
    world.physicsTicks++;
    const controls=readInput();
    brakeLights.forEach(lamp=>{lamp.material.emissiveIntensity=(controls.brake||controls.reverse)?3.2:.75;});
    const spec=cars[currentCarIndex];
    const forward=new THREE.Vector3(Math.sin(world.yaw),0,-Math.cos(world.yaw));
    const right=new THREE.Vector3(Math.cos(world.yaw),0,Math.sin(world.yaw));
    const forwardSpeed=world.velocity.dot(forward);
    let lateralSpeed=world.velocity.dot(right);
    const throttle=controls.gas&&!controls.brake&&!controls.reverse?1:0;
    const maxForward=spec.top/3.6;
    if(throttle) world.velocity.addScaledVector(forward,spec.power*dt);
    if(controls.brake) {
      // Space is a brake only. It never unexpectedly sends the car into reverse.
      if(forwardSpeed>0.05) world.velocity.addScaledVector(forward,-Math.min(forwardSpeed,48*dt));
      else if(forwardSpeed<-.05) world.velocity.addScaledVector(forward,Math.min(-forwardSpeed,48*dt));
    } else if(controls.reverse) {
      // S / Down first brakes forward motion, then continues accelerating backwards.
      // Do not brake the car again after it has already entered reverse.
      if(forwardSpeed>0.8) {
        world.velocity.addScaledVector(forward,-Math.min(forwardSpeed,28*dt));
      } else {
        world.velocity.addScaledVector(forward,-spec.power*.5*dt);
      }
    }
  
    // Keep lateral response predictable: grip is applied every frame, not only while steering.
    lateralSpeed=world.velocity.dot(right);
    world.velocity.addScaledVector(right,-lateralSpeed*Math.min(1,spec.grip*dt));
    const drag=throttle ? .9997 : .9977;
    world.velocity.multiplyScalar(Math.pow(drag,dt*60));
    let speedAlong=world.velocity.dot(forward);
    if(speedAlong>maxForward)world.velocity.addScaledVector(forward,maxForward-speedAlong);
    if(speedAlong<-15)world.velocity.addScaledVector(forward,-15-speedAlong);
    speedAlong=world.velocity.dot(forward);
  
    const steering=(controls.right?1:0)-(controls.left?1:0);
    const speedFactor=clamp(Math.abs(speedAlong)/10,0,1);
    const reverse=speedAlong<-.4?-1:1;
    // Steering fades to zero when stopped, so the car cannot spin in place.
    const steeringResponse=speedFactor===0?0:.16+speedFactor*.58;
    world.yaw+=steering*spec.steer*steeringResponse*reverse*dt;
    world.speed=world.velocity.length()*(speedAlong<0?-1:1);
    world.steering=steering;
    world.lateral=world.velocity.dot(right);
  
    const old=player.position.clone();
    let hitSomething=false;
    player.position.addScaledVector(world.velocity,dt);
    player.position.y=0;
  
    // Stay within the designed city limits.
    if(Math.abs(player.position.x)>WORLD_LIMIT||Math.abs(player.position.z)>WORLD_LIMIT) {
      player.position.copy(old);world.velocity.multiplyScalar(-.16);hitSomething=true;toast("CITY LIMIT — TURN BACK",1);
    }
  
    // Building collision.
    let collision=false;
    for(const b of world.buildings) {
      if(Math.abs(player.position.x-b.x)<b.w*.5+1.45 && Math.abs(player.position.z-b.z)<b.d*.5+2.35) {
        collision=true;break;
      }
    }
    if(collision) {
      player.position.x=old.x;player.position.z=old.z;
      world.velocity.multiplyScalar(-.28);
      hitSomething=true;
      world.score=Math.max(0,world.score-2);
      if(Math.abs(speedAlong)>7)toast("IMPACT — WATCH THE ROAD",1.1);
    }
  
    // Cones in the practice district are solid visual obstacles.
    for(const obstacle of world.obstacles) {
      if(obstacle.hit)continue;
      const dx=player.position.x-obstacle.x,dz=player.position.z-obstacle.z;
      if(dx*dx+dz*dz<(obstacle.radius+1.0)*(obstacle.radius+1.0)) {
        player.position.x=old.x;player.position.z=old.z;
        world.velocity.multiplyScalar(-.22);
        hitSomething=true;
        obstacle.hit=true;obstacle.group.visible=false;
        toast("CONE HIT — TRY A CLEAN LINE",1.1);
      }
    }
  
    // Traffic shares the city roads and gently slows the player on contact.
    for(const t of world.traffic) {
      const dx=player.position.x-t.group.position.x;
      const dz=player.position.z-t.group.position.z;
      if(dx*dx+dz*dz<18.0) {
        player.position.copy(old);world.velocity.multiplyScalar(-.18);hitSomething=true;toast("TRAFFIC CONTACT",.8);
      }
    }
  
    player.rotation.y=world.yaw;
    player.rotation.z=damp(player.rotation.z,-steering*.035,5,dt);
    player.rotation.x=damp(player.rotation.x,0,3,dt);
    if(playerLight)playerLight.intensity=1.25;
  
    vehicleWheels.forEach(w=>{
      if(w.mesh) {
        w.mesh.rotation.x-=speedAlong*dt/.34;
        if(w.front)w.mesh.rotation.y=steering*.22;
      }
    });
  
    world.distance+=player.position.distanceTo(old);
    world.prevPosition.copy(player.position);
    if(hitSomething) {
      world.safeTimer=0;
    } else {
      world.safeTimer+=dt;
      if(world.safeTimer>=.75) {
        world.safePosition.copy(player.position);
        world.safeYaw=world.yaw;
        world.safeTimer=0;
      }
    }
    collectStars();
    updateRace();
    updateHUD(speedAlong);
  }
  
  function updateRace() {
    const player=getPlayer();
    if(!player)return;
    if(!world.raceActive || !world.gates[world.raceIndex])return;
    const gate=world.gates[world.raceIndex];
    if(player.position.distanceTo(gate.position)<8.5) {
      gate.active=false;
      gate.group.traverse(o=>{if(o.material&&o.material.emissive)o.material.emissive.setHex(0x161616);});
      world.raceIndex++;
      if(world.raceIndex>=world.gates.length) {
        world.raceActive=false;
        const elapsed=(performance.now()-world.raceStart)/1000;
        world.score+=Math.max(250,Math.round(1200-elapsed*12));
        $("mission-title").textContent=world.mode==="skill"?"SKILL COURSE COMPLETE":"SPRINT COMPLETE";
        $("mission-sub").textContent="Time " + elapsed.toFixed(2) + "s · Drive again to beat it";
        toast((world.mode==="skill"?"COURSE COMPLETE — ":"SPRINT COMPLETE — ")+elapsed.toFixed(2)+"s",3);
      } else {
        world.gates[world.raceIndex].active=true;
        toast("CHECKPOINT "+world.raceIndex+"/"+world.gates.length,1);
      }
    }
  }
  
  function updateHUD(forwardSpeed) {
    $("speed").textContent=String(Math.round(Math.abs(forwardSpeed)*3.6)).padStart(3,"0");
    const kmh=Math.abs(forwardSpeed)*3.6;
    $("gear").textContent=forwardSpeed<-.7?"R":kmh<3?"N":String(clamp(Math.floor(kmh/48)+1,1,7));
    $("distance-count").textContent=(world.distance/1000).toFixed(1);
    $("score-count").textContent=world.score.toLocaleString();
    $("star-count").textContent=world.collected;
    if(world.raceActive) {
      const t=((performance.now()-world.raceStart)/1000).toFixed(1);
      $("mission-title").textContent=(world.mode==="skill"?"SKILL COURSE  ":"CITY SPRINT  ")+world.raceIndex+"/"+world.gates.length;
      $("mission-sub").textContent="TIME  "+t+"s";
    }
    if(world.toastTimer>0) {
      world.toastTimer-=1/60;
      if(world.toastTimer<=0)$("toast").style.opacity="0";
    }
  }
  
  
  return { updatePhysics, updateRace, updateHUD };
}
