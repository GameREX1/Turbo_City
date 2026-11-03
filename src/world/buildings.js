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
    const floors=Math.floor(h/4.15);
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
    if(index%5===0 && h>45) {
      const sign=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w*.76,25),5.5),new THREE.MeshBasicMaterial({map:signTexture(index%2?"RAX PLAZA":"TURBO CITY"),side:THREE.DoubleSide}));
      sign.position.set(x,h*.72,z+d/2+.12);scene.add(sign);
    }
  }
  
  function buildWindows(windowMatrices) {
    const geometry=new THREE.BoxGeometry(1,1,.08);
    const coolMat=new THREE.MeshStandardMaterial({color:0x91c7d4,roughness:.28,metalness:.52,emissive:0x1a3b47,emissiveIntensity:.13});
    const warmMat=new THREE.MeshStandardMaterial({color:0xf2c992,roughness:.35,metalness:.25,emissive:0x8d5d25,emissiveIntensity:.22});
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
    const trunkMat=material(0x69513b,1);
    const leafMats=[material(0x2f6f4b,1),material(0x3f8258,1),material(0x477d51,1)];
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
    const crownGeometry=new THREE.IcosahedronGeometry(2.35,2);
    batches.crowns.forEach((items,i)=>add(crownGeometry,leafMats[i],items));
    add(new THREE.IcosahedronGeometry(1.45,1),leafMats[1],batches.secondary);
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
    const bulbMat=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xa7e9ff,emissiveIntensity:2.8,roughness:.15});
    const roads=[];for(let n=-3;n<=3;n++)roads.push(n*ROAD_SPACING);
    let index=0;
    for(const p of roads) for(let z=-480;z<=480;z+=96) {
      if(Math.abs(z-p)<30) continue;
      const side=(index++%2===0)?1:-1;
      const x=p+side*24;
      cylinder(scene,.12,.17,8,poleMat,x,4,z,10);
      const arm=box(scene,1.8,.12,.12,poleMat,x-side*.75,7.85,z,false);
      const lamp=new THREE.Mesh(new THREE.BoxGeometry(.62,.18,.4),bulbMat);
      lamp.position.set(x-side*1.45,7.72,z);scene.add(lamp);
    }
    // Traffic signals at selected downtown crossings.
    for(const p of [-160,0,160]) for(const q of [-160,0,160]) {
      const x=p+21,z=q+21;
      cylinder(scene,.12,.16,6.5,poleMat,x,3.25,z,9);
      const head=box(scene,.48,1.45,.48,material(0x1b252c,.45,.35),x,6.15,z,false);
      for(let i=0;i<3;i++) {
        const c=[0xff4a43,0xffc44b,0x53df8c][i];
        const bulb=new THREE.Mesh(new THREE.SphereGeometry(.14,10,8),new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:.6}));
        bulb.position.set(x,6.63-i*.45,z+.255);scene.add(bulb);
      }
    }
  }
  
  function buildCity() {
    const windowMatrices={cool:[],warm:[]};
    const batches={
      bodies:Array.from({length:7},()=>[]),plinths:[],roofs:[],rooftop:[],ventCaps:[]
    };
    const colors=[0x78858e,0x5d7180,0x77828a,0x4b6070,0x89918f,0x566573,0x6e7b85];
    const bodyMaterials=colors.map(color=>material(color,.78,.16));
    const shared={
      plinth:material(0x39444b,.9),
      roof:material(0x35424b,.65,.32),
      rooftop:material(0x46515a,.82,.25),
      ventCap:material(0x252f37,.5)
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
        const h=24+((seed*19)%85);
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
    buildWindows(windowMatrices);
    buildParks();
    buildStreetFurniture();
  }
  
  
  return { buildCity, signTexture };
}
