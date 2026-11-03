import * as THREE from "three";

export function createCameraModule({ world, getPlayer, getCamera, ROAD_SPACING, clamp, damp, $ }) {
  function updateCamera(dt) {
    const player=getPlayer();
    const camera=getCamera();
    if(!player)return;
    const yaw=world.yaw;
    const forward=new THREE.Vector3(Math.sin(yaw),0,-Math.cos(yaw));
    let desired,target;
    if(world.cameraMode===2) {
      desired=player.position.clone().addScaledVector(forward,-1.25);
      desired.y+=1.45;
      target=player.position.clone().addScaledVector(forward,22);
      target.y+=1.4;
    } else {
      const distance=world.cameraMode===1?15:10.7;
      const height=world.cameraMode===1?7.0:4.9;
      desired=player.position.clone().addScaledVector(forward,-distance);
      desired.y+=height+Math.min(2,Math.abs(world.speed)*.018);
      target=player.position.clone().addScaledVector(forward,7.5);
      target.y+=1.4;
    }
    const follow=1-Math.exp(-4.4*dt);
    camera.position.lerp(desired,follow);
    camera.lookAt(target);
    const speedFactor=clamp(Math.abs(world.speed)/78,0,1);
    camera.fov=damp(camera.fov,61+speedFactor*8+0,2.2,dt);
    camera.updateProjectionMatrix();
  }
  
  function drawMiniMap() {
    const player=getPlayer();
    const canvas=$("minimap"),ctx=canvas.getContext("2d"),w=canvas.width,h=canvas.height;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle="#101d28";ctx.fillRect(0,0,w,h);
    ctx.strokeStyle="#4b5963";ctx.lineWidth=7;
    for(let p=-3;p<=3;p++) {
      const q=(p*ROAD_SPACING+600)/1200*w;
      ctx.beginPath();ctx.moveTo(q,0);ctx.lineTo(q,h);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,q);ctx.lineTo(w,q);ctx.stroke();
    }
    ctx.fillStyle="#68835e";
    ctx.fillRect((340+600)/1200*w,(-470+600)/1200*h,(120/1200)*w,(120/1200)*h);
    for(const s of world.stars)if(s.active) {
      const x=(s.group.position.x+600)/1200*w,y=(s.group.position.z+600)/1200*h;
      ctx.fillStyle="#ffc654";ctx.beginPath();ctx.arc(x,y,2.7,0,Math.PI*2);ctx.fill();
    }
    // Highlight the next race checkpoint on the map so the route is always readable.
    if(world.raceActive && world.gates[world.raceIndex]) {
      const gate=world.gates[world.raceIndex].position;
      const gx=(gate.x+600)/1200*w,gy=(gate.z+600)/1200*h;
      const px=player?(player.position.x+600)/1200*w:0;
      const py=player?(player.position.z+600)/1200*h:0;
      ctx.save();
      ctx.setLineDash([5,5]);ctx.strokeStyle="#30ddf5";ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(gx,gy);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle="#ffbd49";ctx.strokeStyle="#1b1c20";ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(gx,gy,7,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.restore();
    }
    if(player) {
      const x=(player.position.x+600)/1200*w,y=(player.position.z+600)/1200*h;
      ctx.save();ctx.translate(x,y);ctx.rotate(-world.yaw);
      ctx.fillStyle="#4ce6fa";ctx.strokeStyle="#07131c";ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6,8);ctx.lineTo(0,5);ctx.lineTo(-6,8);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.restore();
    }
  }
  
  return { updateCamera, drawMiniMap };
}
