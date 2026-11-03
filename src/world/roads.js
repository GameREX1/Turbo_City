import * as THREE from "three";

export function createRoadModule({ scene, ROAD_SPACING, material, makeNoiseTexture, box }) {
  function addInstancedBoxes(geometry,mat,items) {
    if(!items.length)return;
    const inst=new THREE.InstancedMesh(geometry,mat,items.length);
    const obj=new THREE.Object3D();
    items.forEach((it,i)=>{
      obj.position.set(it.x,it.y,it.z);
      obj.rotation.set(0,it.ry||0,0);
      obj.scale.set(it.sx||1,it.sy||1,it.sz||1);
      obj.updateMatrix();
      inst.setMatrixAt(i,obj.matrix);
    });
    inst.instanceMatrix.needsUpdate=true;
    inst.castShadow=false;inst.receiveShadow=true;
    scene.add(inst);
  }
  
  function makeAsphaltTexture() {
    const canvas=document.createElement("canvas");
    canvas.width=canvas.height=512;
    const ctx=canvas.getContext("2d");
    ctx.fillStyle="#34383b";
    ctx.fillRect(0,0,512,512);
    let seed=41027;
    const random=()=>{
      seed=(1664525*seed+1013904223)>>>0;
      return seed/4294967296;
    };
    // Fine mineral grain and tiny aggregate specks.
    for(let i=0;i<36000;i++){
      const shade=random()>.52?"#777b7d":"#15191c";
      ctx.globalAlpha=.035+random()*.11;
      ctx.fillStyle=shade;
      const size=.35+random()*1.5;
      ctx.fillRect(random()*512,random()*512,size,size);
    }
    // Faded repair patches and oil-darkened areas.
    for(let i=0;i<22;i++){
      const x=random()*512,y=random()*512,w=18+random()*90,h=8+random()*42;
      ctx.globalAlpha=.05+random()*.07;
      ctx.fillStyle=random()>.5?"#171b1d":"#76797a";
      ctx.beginPath();
      ctx.ellipse(x,y,w,h,random()*Math.PI,0,Math.PI*2);
      ctx.fill();
    }
    // Hairline cracks with irregular branches.
    ctx.lineCap="round";
    for(let i=0;i<18;i++){
      let x=random()*512,y=random()*512;
      ctx.globalAlpha=.18+random()*.16;
      ctx.strokeStyle="#171a1c";
      ctx.lineWidth=.5+random()*.8;
      ctx.beginPath();
      ctx.moveTo(x,y);
      for(let k=0;k<5;k++){
        x+=(random()-.5)*28;
        y+=(random()-.5)*32;
        ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
    // Faint tyre scuffs.
    for(let i=0;i<9;i++){
      const y=random()*512;
      ctx.globalAlpha=.045;
      ctx.strokeStyle="#101416";
      ctx.lineWidth=2+random()*3;
      ctx.beginPath();
      ctx.moveTo(random()*180,y);
      ctx.bezierCurveTo(180,y-8,330,y+8,512,y+(random()-.5)*18);
      ctx.stroke();
    }
    ctx.globalAlpha=1;
    const texture=new THREE.CanvasTexture(canvas);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=Math.min(4,8);
    return texture;
  }

  function buildGroundAndRoads() {
    const grass = makeNoiseTexture("#667653","#9aa17f",112);
    const asphalt = makeAsphaltTexture();
    grass.repeat.set(90,90);
    const grassMat = new THREE.MeshStandardMaterial({map:grass,roughness:1,metalness:0});
    const roadMatV = new THREE.MeshStandardMaterial({map:asphalt,bumpMap:asphalt,bumpScale:.018,roughness:.86,metalness:.045});
    const roadMatH = new THREE.MeshStandardMaterial({map:asphalt.clone(),bumpMap:asphalt.clone(),bumpScale:.018,roughness:.86,metalness:.045});
    roadMatV.map.repeat.set(2,48);
    roadMatH.map.repeat.set(48,2);
    roadMatH.map.needsUpdate = true;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1500,1500),grassMat);
    ground.rotation.x=-Math.PI/2; ground.position.y=-.14; ground.receiveShadow=true; scene.add(ground);
  
    const concreteMap=makeNoiseTexture("#a4a39a","#d1cec3",85);
    concreteMap.repeat.set(28,28);
    const concrete = new THREE.MeshStandardMaterial({map:concreteMap,roughness:.96,metalness:.01});
    const yellow = material(0xe5c64f,.86,.02);
    const white = material(0xe8e6de,.85,.015);
    const roads = [];
    const dashV=[],dashH=[],zebraV=[],zebraH=[],stopH=[],stopV=[];
    for(let i=-3;i<=3;i++) roads.push(i*ROAD_SPACING);
    for(const p of roads) {
      const v = new THREE.Mesh(new THREE.PlaneGeometry(32,1320),roadMatV);
      v.rotation.x=-Math.PI/2; v.position.set(p,0,0); v.receiveShadow=true; scene.add(v);
      const h = new THREE.Mesh(new THREE.PlaneGeometry(1320,32),roadMatH);
      h.rotation.x=-Math.PI/2; h.position.set(0,.001,p); h.receiveShadow=true; scene.add(h);
      for(const side of [-1,1]) {
        const vSide = new THREE.Mesh(new THREE.PlaneGeometry(4,1320),concrete);
        vSide.rotation.x=-Math.PI/2; vSide.position.set(p+side*19,.008,0); scene.add(vSide);
        const hSide = new THREE.Mesh(new THREE.PlaneGeometry(1320,4),concrete);
        hSide.rotation.x=-Math.PI/2; hSide.position.set(0,.009,p+side*19); scene.add(hSide);
        box(scene,.14,.025,1320,white,p+side*14.1,.035,0,false);
        box(scene,1320,.025,.14,white,0,.035,p+side*14.1,false);
      }
      for(let n=-10;n<=10;n++) {
        const z=n*58;
        if(Math.abs(z-p)<23) continue;
        dashV.push({x:p,y:.033,z});
        dashH.push({x:z,y:.033,z:p});
      }
    }
    // All road paint is batched into instanced meshes to keep draw calls low.
    addInstancedBoxes(new THREE.BoxGeometry(.16,.026,7),yellow,dashV);
    addInstancedBoxes(new THREE.BoxGeometry(7,.026,.16),yellow,dashH);
  
    // Zebra crossings and stop bars at the larger intersections.
    for(const x of roads) for(const z of roads) {
      for(let k=-5;k<=5;k++) {
        zebraV.push({x:x+k*1.38,y:.035,z:z-23});
        zebraV.push({x:x+k*1.38,y:.035,z:z+23});
        zebraH.push({x:x-23,y:.035,z:z+k*1.38});
        zebraH.push({x:x+23,y:.035,z:z+k*1.38});
      }
      stopH.push({x,y:.04,z:z-31},{x,y:.04,z:z+31});
      stopV.push({x:x-31,y:.04,z},{x:x+31,y:.04,z});
    }
    addInstancedBoxes(new THREE.BoxGeometry(.72,.026,7.5),white,zebraV);
    addInstancedBoxes(new THREE.BoxGeometry(7.5,.026,.72),white,zebraH);
    addInstancedBoxes(new THREE.BoxGeometry(31,.035,.22),yellow,stopH);
    addInstancedBoxes(new THREE.BoxGeometry(.22,.035,31),yellow,stopV);

    const manholes=[];
    const drains=[];
    for(let ix=0;ix<roads.length;ix++){
      for(let iz=0;iz<roads.length;iz++){
        if((ix+iz)%2===0)manholes.push({x:roads[ix]+10,y:.018,z:roads[iz]+10});
      }
    }
    for(const p of roads)for(let z=-440;z<=440;z+=110){
      drains.push({x:p+20.4,y:.026,z,sx:1.2,sy:.025,sz:.32});
      drains.push({x:p-20.4,y:.026,z,sx:1.2,sy:.025,sz:.32});
    }
    const coverGeometry=new THREE.CylinderGeometry(.58,.58,.055,16);
    const coverMaterial=material(0x51575a,.82,.35);
    const covers=new THREE.InstancedMesh(coverGeometry,coverMaterial,manholes.length);
    const coverDummy=new THREE.Object3D();
    manholes.forEach((it,i)=>{
      coverDummy.position.set(it.x,it.y,it.z);
      coverDummy.updateMatrix();
      covers.setMatrixAt(i,coverDummy.matrix);
    });
    covers.instanceMatrix.needsUpdate=true;
    covers.castShadow=false;covers.receiveShadow=false;scene.add(covers);
    const drainMaterial=material(0x303638,.92,.12);
    addInstancedBoxes(new THREE.BoxGeometry(1,1,1),drainMaterial,drains);
  }
  
  
  return { buildGroundAndRoads, addInstancedBoxes };
}
