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
  
  function buildGroundAndRoads() {
    const grass = makeNoiseTexture("#647b58","#a4b58b",112);
    const asphalt = makeNoiseTexture("#31373e","#a0a6a8",41);
    grass.repeat.set(90,90);
    const grassMat = new THREE.MeshStandardMaterial({map:grass,roughness:1});
    const roadMatV = new THREE.MeshStandardMaterial({map:asphalt,roughness:.96});
    const roadMatH = new THREE.MeshStandardMaterial({map:asphalt.clone(),roughness:.96});
    roadMatV.map.repeat.set(2,48);
    roadMatH.map.repeat.set(48,2);
    roadMatH.map.needsUpdate = true;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1500,1500),grassMat);
    ground.rotation.x=-Math.PI/2; ground.position.y=-.14; ground.receiveShadow=true; scene.add(ground);
  
    const concrete = material(0x999d9b,.95);
    const yellow = material(0xf3c85f,.85);
    const white = material(0xe2e5e2,.85);
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
  }
  
  
  return { buildGroundAndRoads, addInstancedBoxes };
}
