import * as THREE from "three";

export function createTrafficModule({ scene, world, material, box, rand }) {
  function buildTraffic() {
    const colors=[0xe7e4d9,0x2c536f,0x9b3038,0x777f83,0xd2a34b,0x1d3433,0x526a86];
    const roadXs=[-320,-160,0,160,320];
    for(let i=0;i<16;i++) {
      const g=new THREE.Group();
      const direction=i%2===0?1:-1;
      const paint=new THREE.MeshPhysicalMaterial({
        color:colors[i%colors.length],metalness:.48,roughness:.28,clearcoat:.85,clearcoatRoughness:.16
      });
      const glass=new THREE.MeshPhysicalMaterial({color:0x172b38,metalness:.22,roughness:.12,clearcoat:1});
      const dark=material(0x10171d,.55,.5);
      box(g,1.92,.52,4.02,paint,0,.72,0,false);
      box(g,1.62,.57,1.9,glass,0,1.2,-.02,false);
      box(g,1.82,.13,.34,dark,0,.47,-2.03,false);
      box(g,1.82,.13,.34,dark,0,.47,2.03,false);
      // Headlights and tail lamps help the traffic read as vehicles at a distance.
      for(const side of [-1,1]) {
        const head=new THREE.Mesh(new THREE.BoxGeometry(.38,.12,.06),new THREE.MeshStandardMaterial({color:0xf3fbff,emissive:0x8fcfff,emissiveIntensity:1.25}));
        head.position.set(side*.62,.83,-2.045);g.add(head);
        const tail=new THREE.Mesh(new THREE.BoxGeometry(.42,.13,.06),new THREE.MeshStandardMaterial({color:0xff3448,emissive:0xb40d20,emissiveIntensity:1.0}));
        tail.position.set(side*.62,.82,2.045);g.add(tail);
      }
      const tire=material(0x111519,.94);
      const rim=material(0xb9c3c9,.24,.92);
      const wheels=[];
      for(const sx of [-1,1])for(const sz of [-1,1]) {
        const pivot=new THREE.Group();
        pivot.position.set(sx*.98,.39,sz*1.27);
        g.add(pivot);
        const w=new THREE.Mesh(new THREE.CylinderGeometry(.35,.35,.24,18),tire);
        w.rotation.z=Math.PI/2;w.castShadow=true;pivot.add(w);
        const hub=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.255,14),rim);
        hub.rotation.z=Math.PI/2;pivot.add(hub);
        wheels.push(w);
      }
      const roadX=roadXs[Math.floor(i/2)%roadXs.length];
      const laneX=roadX+(direction>0?-6.2:6.2);
      let z=rand(-490,490);
      // Keep the spawn intersection clear so the player is not hit at game start.
      if(Math.abs(laneX)<20&&Math.abs(z)<105)z=z<0?-165:165;
      g.position.set(laneX,.02,z);
      g.rotation.y=direction>0?Math.PI:0;
      scene.add(g);
      world.traffic.push({group:g,x:laneX,z,speed:rand(9,16),direction,wheels});
    }
  }
  
  
  function updateTraffic(dt) {
    for(const t of world.traffic) {
      t.z+=t.speed*t.direction*dt;
      if(t.z>520)t.z=-520;
      if(t.z<-520)t.z=520;
      t.group.position.z=t.z;
      if(t.wheels) t.wheels.forEach(w=>{w.rotation.x+=t.speed*t.direction*dt/.34;});
    }
  }
  
  return { buildTraffic, updateTraffic };
}
