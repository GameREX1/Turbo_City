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
    inst.castShadow=false;
    inst.receiveShadow=true;
    scene.add(inst);
  }

  function makeAsphaltTexture() {
    const canvas=document.createElement("canvas");
    canvas.width=canvas.height=512;
    const ctx=canvas.getContext("2d");
    ctx.fillStyle="#3b4145";
    ctx.fillRect(0,0,512,512);
    let seed=41027;
    const random=()=>{
      seed=(1664525*seed+1013904223)>>>0;
      return seed/4294967296;
    };
    // Fine, even aggregate grain keeps the asphalt realistic without looking damaged.
    for(let i=0;i<26000;i++){
      const light=random()>.52;
      ctx.globalAlpha=.025+random()*.055;
      ctx.fillStyle=light?"#858b8d":"#151a1d";
      const size=.3+random()*1.1;
      ctx.fillRect(random()*512,random()*512,size,size);
    }
    // Very subtle resurfacing variation; no visible cracks or heavy tyre stains.
    for(let i=0;i<8;i++){
      const x=random()*512,y=random()*512,w=28+random()*70,h=12+random()*24;
      ctx.globalAlpha=.025+random()*.025;
      ctx.fillStyle=random()>.5?"#252b2f":"#687176";
      ctx.beginPath();
      ctx.ellipse(x,y,w,h,random()*Math.PI,0,Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha=1;
    const texture=new THREE.CanvasTexture(canvas);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=Math.min(8,8);
    return texture;
  }

  function buildGroundAndRoads() {
    const grass=makeNoiseTexture("#667653","#9aa17f",112);
    const asphalt=makeAsphaltTexture();
    grass.repeat.set(90,90);
    const grassMat=new THREE.MeshStandardMaterial({map:grass,roughness:1,metalness:0});
    const roadMatV=new THREE.MeshStandardMaterial({
      map:asphalt,bumpMap:asphalt,bumpScale:.009,roughness:.92,metalness:.015
    });
    const roadHorizontal=asphalt.clone();
    const roadBumpHorizontal=asphalt.clone();
    roadMatV.map.repeat.set(2,48);
    const roadMatH=new THREE.MeshStandardMaterial({
      map:roadHorizontal,bumpMap:roadBumpHorizontal,bumpScale:.009,roughness:.92,metalness:.015
    });
    roadMatH.map.repeat.set(48,2);
    roadMatH.bumpMap.repeat.set(48,2);

    const ground=new THREE.Mesh(new THREE.PlaneGeometry(1500,1500),grassMat);
    ground.rotation.x=-Math.PI/2;
    ground.position.y=-.14;
    ground.receiveShadow=true;
    scene.add(ground);

    const concreteMap=makeNoiseTexture("#b7b8b2","#e0ded5",85);
    concreteMap.repeat.set(28,28);
    const concrete=new THREE.MeshStandardMaterial({map:concreteMap,roughness:.96,metalness:.01});
    const yellow=material(0xf1c84f,.82,.015);
    const white=material(0xf4f3ec,.82,.01);
    const curbMat=material(0xc7c8c2,.9,.015);
    const seamMat=material(0x999c98,.95,.005);
    const drainMat=material(0x343a3e,.9,.12);
    const coverMat=material(0x596064,.82,.28);

    const roads=[];
    for(let i=-3;i<=3;i++)roads.push(i*ROAD_SPACING);

    const curbItems=[];
    const edgeItemsV=[],edgeItemsH=[];
    const centerItemsV=[],centerItemsH=[];
    const dashItemsV=[],dashItemsH=[];
    const sidewalkSeamsV=[],sidewalkSeamsH=[];
    const zebraV=[],zebraH=[];
    const stopV=[],stopH=[];
    const manholes=[],drains=[];

    // Segment long pavement details around each junction so crossings stay open.
    function addRoadsideSegments(target,axis,fixed,halfWidth,y,height=0.14) {
      let cursor=-660;
      const halfGap=22;
      for(const cross of roads) {
        const before=cross-halfGap;
        if(before>cursor) {
          const length=before-cursor;
          target.push(axis==="z"
            ?{x:fixed,y,z:(cursor+before)/2,sx:halfWidth,sy:height,sz:length}
            :{x:(cursor+before)/2,y,z:fixed,sx:length,sy:height,sz:halfWidth});
        }
        cursor=cross+halfGap;
      }
      if(cursor<660) {
        const length=660-cursor;
        target.push(axis==="z"
          ?{x:fixed,y,z:(cursor+660)/2,sx:halfWidth,sy:height,sz:length}
          :{x:(cursor+660)/2,y,z:fixed,sx:length,sy:height,sz:halfWidth});
      }
    }

    function nearJunction(value) {
      return roads.some(cross=>Math.abs(value-cross)<24);
    }

    for(const p of roads) {
      // Smooth 32 m carriageways with a slightly offset crossing surface to avoid z-fighting.
      const vertical=new THREE.Mesh(new THREE.PlaneGeometry(32,1320),roadMatV);
      vertical.rotation.x=-Math.PI/2;
      vertical.position.set(p,0,0);
      vertical.receiveShadow=true;
      scene.add(vertical);

      const horizontal=new THREE.Mesh(new THREE.PlaneGeometry(1320,32),roadMatH);
      horizontal.rotation.x=-Math.PI/2;
      horizontal.position.set(0,.002,p);
      horizontal.receiveShadow=true;
      scene.add(horizontal);

      for(const side of [-1,1]) {
        const sidewalkV=new THREE.Mesh(new THREE.PlaneGeometry(4,1320),concrete);
        sidewalkV.rotation.x=-Math.PI/2;
        sidewalkV.position.set(p+side*19,.009,0);
        sidewalkV.receiveShadow=true;
        scene.add(sidewalkV);

        const sidewalkH=new THREE.Mesh(new THREE.PlaneGeometry(1320,4),concrete);
        sidewalkH.rotation.x=-Math.PI/2;
        sidewalkH.position.set(0,.01,p+side*19);
        sidewalkH.receiveShadow=true;
        scene.add(sidewalkH);

        // Raised, clean curb edges with breaks at junction mouths.
        addRoadsideSegments(curbItems,"z",p+side*16.15, .28,.075,.13);
        addRoadsideSegments(curbItems,"x",p+side*16.15, .28,.075,.13);
        addRoadsideSegments(edgeItemsV,"z",p+side*14.35,.16,.047,.025);
        addRoadsideSegments(edgeItemsH,"x",p+side*14.35,.16,.047,.025);

        // Subtle paving joints keep the sidewalks from reading as one flat slab.
        for(let mark=-648;mark<=648;mark+=12) {
          if(nearJunction(mark))continue;
          sidewalkSeamsV.push({x:p+side*19,y:.025,z:mark,sx:3.65,sy:.012,sz:.035});
          sidewalkSeamsH.push({x:mark,y:.026,z:p+side*19,sx:.035,sy:.012,sz:3.65});
        }
      }

      // Two marked lanes in each direction, with a double-yellow centre divider.
      addRoadsideSegments(centerItemsV,"z",p-.24,.13,.052,.025);
      addRoadsideSegments(centerItemsV,"z",p+.24,.13,.052,.025);
      addRoadsideSegments(centerItemsH,"x",p-.24,.13,.052,.025);
      addRoadsideSegments(centerItemsH,"x",p+.24,.13,.052,.025);

      for(const laneOffset of [-7,7]) {
        for(let mark=-650;mark<=650;mark+=14) {
          if(nearJunction(mark))continue;
          dashItemsV.push({x:p+laneOffset,y:.052,z:mark,sx:.14,sy:.025,sz:5.5});
          dashItemsH.push({x:mark,y:.053,z:p+laneOffset,sx:5.5,sy:.025,sz:.14});
        }
      }

      // Clean crosswalk and stop-bar markings at every major intersection.
      for(const junction of roads) {
        for(const approach of [-1,1]) {
          const crossZ=junction+approach*23;
          const crossX=junction+approach*23;
          for(let k=-11;k<=11;k++) {
            zebraV.push({x:p+k*1.28,y:.055,z:crossZ,sx:.72,sy:.025,sz:7.2});
            zebraH.push({x:crossX,y:.056,z:p+k*1.28,sx:7.2,sy:.025,sz:.72});
          }
          stopV.push({x:p,y:.056,z:junction+approach*32,sx:29,sy:.026,sz:.20});
          stopH.push({x:junction+approach*32,y:.057,z:p,sx:.20,sy:.026,sz:29});
        }
      }
    }

    // Raised curbs, lane paint, double-yellow dividers and sidewalks are batched.
    const unitBox=new THREE.BoxGeometry(1,1,1);
    addInstancedBoxes(unitBox,curbMat,curbItems);
    addInstancedBoxes(unitBox,white,edgeItemsV);
    addInstancedBoxes(unitBox,white,edgeItemsH);
    addInstancedBoxes(unitBox,yellow,centerItemsV);
    addInstancedBoxes(unitBox,yellow,centerItemsH);
    addInstancedBoxes(unitBox,white,dashItemsV);
    addInstancedBoxes(unitBox,white,dashItemsH);
    addInstancedBoxes(unitBox,seamMat,sidewalkSeamsV);
    addInstancedBoxes(unitBox,seamMat,sidewalkSeamsH);
    addInstancedBoxes(unitBox,white,zebraV);
    addInstancedBoxes(unitBox,white,zebraH);
    addInstancedBoxes(unitBox,white,stopV);
    addInstancedBoxes(unitBox,white,stopH);

    // Manhole covers and storm drains provide small but convincing street details.
    for(let ix=0;ix<roads.length;ix++) {
      for(let iz=0;iz<roads.length;iz++) {
        if((ix+iz)%2===0)manholes.push({x:roads[ix]+10,y:.024,z:roads[iz]+10});
      }
    }
    for(const p of roads)for(let z=-440;z<=440;z+=110) {
      if(nearJunction(z))continue;
      drains.push({x:p+20.4,y:.028,z,sx:1.15,sy:.035,sz:.28});
      drains.push({x:p-20.4,y:.028,z,sx:1.15,sy:.035,sz:.28});
    }

    const coverGeometry=new THREE.CylinderGeometry(.58,.58,.055,24);
    const covers=new THREE.InstancedMesh(coverGeometry,coverMat,manholes.length);
    const coverDummy=new THREE.Object3D();
    manholes.forEach((it,i)=>{
      coverDummy.position.set(it.x,it.y,it.z);
      coverDummy.updateMatrix();
      covers.setMatrixAt(i,coverDummy.matrix);
    });
    covers.instanceMatrix.needsUpdate=true;
    covers.castShadow=false;
    covers.receiveShadow=false;
    scene.add(covers);
    addInstancedBoxes(unitBox,drainMat,drains);
  }

  return { buildGroundAndRoads, addInstancedBoxes };
}
