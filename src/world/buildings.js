import * as THREE from "three";

export function createBuildingModule({ scene, world, ROAD_SPACING, material, box, cylinder, rand }) {
  function signTexture(text, accent="#32d9f1") {
    const c=document.createElement("canvas"); c.width=512; c.height=128;
    const ctx=c.getContext("2d");
    ctx.fillStyle="#07131f";ctx.fillRect(0,0,512,128);
    ctx.strokeStyle=accent;ctx.lineWidth=7;ctx.strokeRect(7,7,498,114);
    ctx.fillStyle=accent;ctx.font="900 54px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(text,256,65);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
  }


  function addCityBuilding(x,z,w,d,h,index,windowMatrices,batches) {
    // Buildings share materials and are submitted through instanced meshes.
    // The individual collision rectangles remain in world.buildings.
    batches.bodies[index%7].push({x,y:h/2,z,sx:w,sy:h,sz:d});
    world.buildings.push({x,z,w,d});
    batches.plinths.push({x,y:.7,z,sx:w+1.2,sy:1.4,sz:d+1.2});
    batches.roofs.push({x,y:h+.35,z,sx:w*.96,sy:.8,sz:d*.96});

    // Add slim structural mullions and floor bands to break up flat box facades.
    const columnsX=Math.max(3,Math.floor(w/7));
    const columnsZ=Math.max(3,Math.floor(d/7));
    for(let k=0;k<=columnsX;k++) {
      const xx=x-w/2+k*(w/columnsX);
      for(const side of [-1,1]) batches.facadeVertical.push({x:xx,y:h/2,z:z+side*(d/2+.07),sx:.22,sy:h,sz:.14});
    }
    for(let k=0;k<=columnsZ;k++) {
      const zz=z-d/2+k*(d/columnsZ);
      for(const side of [-1,1]) batches.facadeVertical.push({x:x+side*(w/2+.07),y:h/2,z:zz,sx:.14,sy:h,sz:.22});
    }
    const floors=Math.floor(h/4.15);
    for(let floor=3;floor<floors;floor+=3) {
      const yy=floor*4.15;
      batches.facadeHorizontal.push({x,y:yy,z:z+d/2+.085,sx:w,sy:.12,sz:.12});
      batches.facadeHorizontal.push({x,y:yy,z:z-d/2-.085,sx:w,sy:.12,sz:.12});
      batches.facadeHorizontal.push({x:x+w/2+.085,y:yy,z,sx:.12,sy:.12,sz:d});
      batches.facadeHorizontal.push({x:x-w/2-.085,y:yy,z,sx:.12,sy:.12,sz:d});
    }
    const colsX=Math.max(2,Math.floor(w/4.4));
    const colsZ=Math.max(2,Math.floor(d/4.4));
    const winW=1.35, winH=1.75;
    for(let floor=1;floor<floors;floor++) {
      const yy=floor*4.15;
      for(let k=0;k<colsX;k++) {
        const xx=x-w/2+2.2+k*((w-4.4)/Math.max(1,colsX-1));
        const lit=(index*13+floor*5+k*7)%7===0;
        const arr=lit?windowMatrices.warm:windowMatrices.cool;
        arr.push({x:xx,y:yy,z:z+d/2+.055,ry:0,sx:winW,sy:winH});
        arr.push({x:xx,y:yy,z:z-d/2-.055,ry:Math.PI,sx:winW,sy:winH});
      }
      for(let k=0;k<colsZ;k++) {
        const zz=z-d/2+2.2+k*((d-4.4)/Math.max(1,colsZ-1));
        const lit=(index*11+floor*3+k*9)%8===0;
        const arr=lit?windowMatrices.warm:windowMatrices.cool;
        arr.push({x:x+w/2+.055,y:yy,z:zz,ry:Math.PI/2,sx:winW,sy:winH});
        arr.push({x:x-w/2-.055,y:yy,z:zz,ry:-Math.PI/2,sx:winW,sy:winH});
      }
    }
    // Batch rooftop plant rooms and vents by shared material.
    const unitCount=1+(index%3);
    for(let u=0;u<unitCount;u++) {
      const ux=x+(u-unitCount/2)*w*.23;
      const uz=z+(u%2===0?1:-1)*d*.18;
      batches.rooftop.push({x:ux,y:h+1.05,z:uz,sx:w*.15,sy:1.5,sz:d*.18});
      batches.ventCaps.push({x:ux,y:h+1.9,z:uz,sx:w*.1,sy:.18,sz:d*.12});
    }
    // Street-level shopfronts use simple neutral sign bands, not glowing neon.
  }
  
  function buildWindows(windowMatrices) {
    const geometry=new THREE.BoxGeometry(1,1,.08);
    const coolMat=new THREE.MeshPhysicalMaterial({color:0x435d70,roughness:.24,metalness:.32,clearcoat:.8,clearcoatRoughness:.12,emissive:0x101b22,emissiveIntensity:.025});
    const warmMat=new THREE.MeshStandardMaterial({color:0xe2c8a1,roughness:.5,metalness:.06,emissive:0x60472a,emissiveIntensity:.08});
    for(const [items,mat] of [[windowMatrices.cool,coolMat],[windowMatrices.warm,warmMat]]) {
      const inst=new THREE.InstancedMesh(geometry,mat,items.length);
      const obj=new THREE.Object3D();
      items.forEach((it,i)=>{
        obj.position.set(it.x,it.y,it.z);obj.rotation.set(0,it.ry,0);obj.scale.set(it.sx,it.sy,1);obj.updateMatrix();
        inst.setMatrixAt(i,obj.matrix);
      });
      inst.instanceMatrix.needsUpdate=true;
      inst.castShadow=false;inst.receiveShadow=false;scene.add(inst);
    }
  }
  
  function makeTree(x,z,scale=1,batches) {
    const palette=((Math.floor(x+z+1000)%3)+3)%3;
    batches.trunks.push({x,y:1.8*scale,z,scale});
    batches.crowns[palette].push({x,y:4.3*scale,z,scale});
    batches.secondary.push({x:x+.7*scale,y:4.7*scale,z:z+.4*scale,scale});
  }
  function addTreeInstances(batches) {
    const trunkMat=material(0x66513d,.98,.01);
    const leafMats=[material(0x47664a,.96,.01),material(0x59744e,.96,.01),material(0x3e5e45,.98,.01)];
    const add=(geometry,mat,items)=>{
      if(!items.length)return;
      const mesh=new THREE.InstancedMesh(geometry,mat,items.length);
      const dummy=new THREE.Object3D();
      items.forEach((it,i)=>{
        dummy.position.set(it.x,it.y,it.z);
        dummy.scale.setScalar(it.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i,dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate=true;
      mesh.castShadow=false;mesh.receiveShadow=false;scene.add(mesh);
    };
    add(new THREE.CylinderGeometry(.22,.34,3.6,7),trunkMat,batches.trunks);
    const crownGeometry=new THREE.SphereGeometry(2.35,14,10);
    batches.crowns.forEach((items,i)=>add(crownGeometry,leafMats[i],items));
    add(new THREE.SphereGeometry(1.45,12,9),leafMats[1],batches.secondary);
  }
  function buildParks() {
    const parkMat=material(0x58765a,.98);
    const parkCells=[[-240,240],[-400,-80],[240,240]];
    const treeBatches={trunks:[],crowns:[[],[],[]],secondary:[]};
    for(const [x,z] of parkCells) {
      const park=new THREE.Mesh(new THREE.PlaneGeometry(90,88),parkMat);
      park.rotation.x=-Math.PI/2;park.position.set(x,.015,z);scene.add(park);
      for(let i=0;i<18;i++) makeTree(x+rand(-39,39),z+rand(-38,38),rand(.72,1.05),treeBatches);
      const path=box(scene,4,.08,74,material(0xb9b7a7,.95),x,.07,z,false);
      for(let i=0;i<3;i++) {
        box(scene,3.3,.25,.45,material(0x64462e,.85),x+rand(-30,30),.45,z+rand(-30,30));
        cylinder(scene,.08,.08,.8,material(0x333b3d),x,.4,z+rand(-30,30),8);
      }
    }
    addTreeInstances(treeBatches);
  }
  
  function buildStreetFurniture() {
    const poleMat=material(0x343e46,.4,.78);
    const lampMat=new THREE.MeshStandardMaterial({
      color:0xffffff,emissive:0xa7e9ff,emissiveIntensity:2.2,roughness:.25
    });
    const signalHeadMat=material(0x1b252c,.45,.25);
    const signalBulbMats=[
      new THREE.MeshStandardMaterial({color:0xff4a43,emissive:0xff4a43,emissiveIntensity:.55}),
      new THREE.MeshStandardMaterial({color:0xffc44b,emissive:0xffc44b,emissiveIntensity:.55}),
      new THREE.MeshStandardMaterial({color:0x53df8c,emissive:0x53df8c,emissiveIntensity:.55})
    ];
    const lampPoles=[],lampArms=[],lampHeads=[];
    const signalPoles=[],signalHeads=[];
    const signalBulbs=[[],[],[]];
    const roads=[];for(let n=-3;n<=3;n++)roads.push(n*ROAD_SPACING);
    let index=0;

    // Static street furniture is batched: dozens of lamps no longer create
    // hundreds of individual draw calls.
    for(const p of roads) for(let z=-480;z<=480;z+=96) {
      if(Math.abs(z-p)<30) continue;
      const side=(index++%2===0)?1:-1;
      const x=p+side*24;
      lampPoles.push({x,y:4,z});
      lampArms.push({x:x-side*.75,y:7.85,z});
      lampHeads.push({x:x-side*1.45,y:7.72,z});
    }

    // Batch the traffic-light poles, housings and each signal colour.
    for(const p of [-160,0,160]) for(const q of [-160,0,160]) {
      const x=p+21,z=q+21;
      signalPoles.push({x,y:3.25,z});
      signalHeads.push({x,y:6.15,z});
      for(let i=0;i<3;i++)signalBulbs[i].push({x,y:6.63-i*.45,z:z+.255});
    }

    function addInstances(geometry,mat,items) {
      if(!items.length)return;
      const mesh=new THREE.InstancedMesh(geometry,mat,items.length);
      const dummy=new THREE.Object3D();
      items.forEach((item,i)=>{
        dummy.position.set(item.x,item.y,item.z);
        dummy.rotation.set(0,item.ry||0,0);
        dummy.scale.set(item.sx||1,item.sy||1,item.sz||1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i,dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate=true;
      mesh.castShadow=false;
      mesh.receiveShadow=false;
      scene.add(mesh);
    }

    addInstances(new THREE.CylinderGeometry(.12,.17,8,8),poleMat,lampPoles);
    addInstances(new THREE.BoxGeometry(1.8,.12,.12),poleMat,lampArms);
    addInstances(new THREE.BoxGeometry(.62,.18,.4),lampMat,lampHeads);
    addInstances(new THREE.CylinderGeometry(.12,.16,6.5,8),poleMat,signalPoles);
    addInstances(new THREE.BoxGeometry(.48,1.45,.48),signalHeadMat,signalHeads);
    signalBulbs.forEach((items,i)=>addInstances(new THREE.SphereGeometry(.14,8,6),signalBulbMats[i],items));
  }

  function buildCity() {
    const windowMatrices={cool:[],warm:[]};
    const batches={
      bodies:Array.from({length:7},()=>[]),plinths:[],roofs:[],rooftop:[],ventCaps:[],
      facadeVertical:[],facadeHorizontal:[]
    };
    // Subtle concrete/stucco facade texture: fine mineral grain and panel joints.
    const facadeCanvas=document.createElement("canvas");
    facadeCanvas.width=facadeCanvas.height=512;
    const facadeCtx=facadeCanvas.getContext("2d");
    facadeCtx.fillStyle="#a4a6a4";facadeCtx.fillRect(0,0,512,512);
    let facadeSeed=9281;
    const facadeRandom=()=>{facadeSeed=(1664525*facadeSeed+1013904223)>>>0;return facadeSeed/4294967296;};
    for(let i=0;i<19000;i++){
      const shade=facadeRandom()>.5?"#ffffff":"#30343a";
      facadeCtx.globalAlpha=.025+facadeRandom()*.055;
      facadeCtx.fillStyle=shade;
      facadeCtx.fillRect(facadeRandom()*512,facadeRandom()*512,1+facadeRandom()*2,1+facadeRandom()*2);
    }
    facadeCtx.globalAlpha=1;
    for(let y=0;y<=512;y+=64){
      facadeCtx.fillStyle="#777d80";facadeCtx.fillRect(0,y,512,2);
      facadeCtx.fillStyle="#d3d1c9";facadeCtx.fillRect(0,y+2,512,2);
    }
    for(let x=0;x<=512;x+=128){
      facadeCtx.fillStyle="#85898a";facadeCtx.fillRect(x,0,2,512);
    }
    const facadeMap=new THREE.CanvasTexture(facadeCanvas);
    facadeMap.wrapS=facadeMap.wrapT=THREE.RepeatWrapping;
    facadeMap.repeat.set(2,3);
    facadeMap.colorSpace=THREE.SRGBColorSpace;
    facadeMap.anisotropy=Math.min(4,8);
    const colors=[0xb0b2ae,0x929a9f,0xb7b4ac,0x818b91,0xa9a39a,0x8e9898,0xb8b9b4];
    const bodyMaterials=colors.map(color=>new THREE.MeshStandardMaterial({
      color,map:facadeMap,roughness:.72,metalness:.12,bumpMap:facadeMap,bumpScale:.025
    }));
    const shared={
      plinth:material(0x777b7a,.86,.06),
      roof:material(0x656d70,.78,.12),
      rooftop:material(0x747a7a,.8,.08),
      ventCap:material(0x454b4e,.72,.16),
      facade:material(0x666e70,.64,.18),
      facadeBand:material(0xb3b2aa,.72,.08)
    };
    let seed=71;
    const parkBlocks=new Set(["-2,1","-3,-1","1,1"]);
    for(let gx=-3;gx<=2;gx++) for(let gz=-3;gz<=2;gz++) {
      if((gx===2 && gz===-3) || parkBlocks.has(gx+","+gz)) continue;
      const cx=gx*ROAD_SPACING+ROAD_SPACING/2;
      const cz=gz*ROAD_SPACING+ROAD_SPACING/2;
      const n=1+(seed%3);
      for(let k=0;k<n;k++) {
        seed=(seed*9301+49297)%233280;
        const x=cx+(((seed*17)%47)-23);
        const z=cz+(((seed*31)%47)-23);
        const w=26+((seed*7)%24);
        const d=26+((seed*11)%25);
        const h=38+((seed*19)%105);
        addCityBuilding(x,z,w,d,h,seed,windowMatrices,batches);
      }
    }
    const unitBox=new THREE.BoxGeometry(1,1,1);
    const add=(items,mat)=>{
      if(!items.length)return;
      const mesh=new THREE.InstancedMesh(unitBox,mat,items.length);
      const dummy=new THREE.Object3D();
      items.forEach((it,i)=>{
        dummy.position.set(it.x,it.y,it.z);
        dummy.scale.set(it.sx,it.sy,it.sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i,dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate=true;
      mesh.castShadow=false;mesh.receiveShadow=true;scene.add(mesh);
    };
    batches.bodies.forEach((items,i)=>add(items,bodyMaterials[i]));
    add(batches.plinths,shared.plinth);
    add(batches.roofs,shared.roof);
    add(batches.rooftop,shared.rooftop);
    add(batches.ventCaps,shared.ventCap);
    add(batches.facadeVertical,shared.facade);
    add(batches.facadeHorizontal,shared.facadeBand);
    buildWindows(windowMatrices);
    buildParks();
    buildStreetFurniture();
  }
  
  
  return { buildCity, signTexture };
}
