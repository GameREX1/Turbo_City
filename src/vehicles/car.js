import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { CAR_MODEL_URL, DRACO_PATH } from "../config/game.js";

export function createVehicleModule({ scene, material, box, cylinder, cars, getCurrentCarIndex, setLoading }) {
  let vehicleTemplate=null;
  let vehicleWheels=[];
  let brakeLights=[];
  let playerLight=null;
  let fallbackCar=false;
  function buildFallbackVehicle(index) {
    fallbackCar=true;
    const root=new THREE.Group();
    const paint=new THREE.MeshPhysicalMaterial({color:cars[index].color,metalness:.72,roughness:.23,clearcoat:1,clearcoatRoughness:.08});
    const black=material(0x101820,.25,.52);
    const glass=new THREE.MeshPhysicalMaterial({color:0x0b2333,metalness:.18,roughness:.07,transparent:true,opacity:.94,clearcoat:1});
    const hullStations=[
      {z:-2.25,w:.76,b:.35,t:.72},{z:-1.72,w:.91,b:.33,t:.91},{z:-.85,w:1.0,b:.34,t:1.04},
      {z:.6,w:1.0,b:.34,t:1.03},{z:1.65,w:.94,b:.34,t:.83},{z:2.12,w:.82,b:.36,t:.68}
    ];
    const verts=[],indices=[];
    const sides=18;
    hullStations.forEach((s,j)=>{
      for(let i=0;i<sides;i++){
        const a=i/sides*Math.PI*2;
        const c=Math.cos(a),sn=Math.sin(a);
        verts.push(c*s.w,s.b+(sn*.5+.5)*(s.t-s.b),s.z);
      }
    });
    for(let j=0;j<hullStations.length-1;j++)for(let i=0;i<sides;i++){
      const a=j*sides+i,b=j*sides+(i+1)%sides,c=(j+1)*sides+i,d=(j+1)*sides+(i+1)%sides;
      indices.push(a,b,c,b,d,c);
    }
    const hullGeo=new THREE.BufferGeometry();
    hullGeo.setAttribute("position",new THREE.Float32BufferAttribute(verts,3));
    hullGeo.setIndex(indices);hullGeo.computeVertexNormals();
    const hull=new THREE.Mesh(hullGeo,paint);hull.castShadow=true;root.add(hull);
    // Sloped glasshouse instead of a simple rectangular cabin.
    const addQuad=(points,mat)=>{
      const geo=new THREE.BufferGeometry();
      geo.setAttribute("position",new THREE.Float32BufferAttribute(points.flat(),3));
      geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals();
      const mesh=new THREE.Mesh(geo,mat);mesh.material.side=THREE.DoubleSide;
      mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);return mesh;
    };
    box(root,1.3,.13,1.13,paint,0,1.62,.12);
    box(root,1.62,.07,2.02,black,0,1.0,.12);
    addQuad([[-.78,1.02,-.88],[.78,1.02,-.88],[.62,1.57,-.4],[-.62,1.57,-.4]],glass);
    addQuad([[-.78,1.02,1.2],[.78,1.02,1.2],[.62,1.57,.66],[-.62,1.57,.66]],glass);
    for(const side of [-1,1]){
      addQuad([[side*.84,1.03,-.83],[side*.84,1.03,1.15],[side*.65,1.56,.63],[side*.65,1.56,-.37]],glass);
      box(root,.075,.58,.09,black,side*.83,1.3,-.39);
      box(root,.075,.58,.09,black,side*.83,1.3,.69);
      box(root,.25,.13,.34,paint,side*1.02,1.26,-.67);
      box(root,.12,.16,1.82,paint,side*1.01,.48,.16);
      box(root,.15,.045,.58,black,side*.48,.82,-1.42);
      box(root,.22,.09,.46,black,side*.78,.62,.55);
      const lamp=new THREE.Mesh(new THREE.BoxGeometry(.46,.15,.07),new THREE.MeshStandardMaterial({color:0xf4fcff,emissive:0xa5e8ff,emissiveIntensity:2.8}));
      lamp.position.set(side*.62,.74,-2.2);root.add(lamp);
      const tail=new THREE.Mesh(new THREE.BoxGeometry(.6,.14,.07),new THREE.MeshStandardMaterial({color:0xff304b,emissive:0xc60022,emissiveIntensity:2.2}));
      tail.position.set(side*.62,.73,2.18);root.add(tail);
    }
    box(root,.76,.22,.08,black,0,.59,-2.21,false);
    box(root,2.08,.1,.48,black,0,.38,-2.17,false);
    box(root,1.96,.14,.42,black,0,.38,2.14,false);
    // Rear deck vents and a low rear lip add shape without relying on external assets.
    for(let i=-2;i<=2;i++)box(root,.075,.035,.48,black,i*.19,1.02,1.58,false);
    vehicleWheels=[];
    const tire=material(0x101317,.92),rim=material(0xcbd4d8,.22,.9);
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const pivot=new THREE.Group();pivot.position.set(sx*.99,.42,sz*1.38);root.add(pivot);
      const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.36,28),tire);wheel.rotation.z=Math.PI/2;wheel.castShadow=true;pivot.add(wheel);
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,.38,20),rim);hub.rotation.z=Math.PI/2;pivot.add(hub);
      for(let k=0;k<8;k++){
        const spoke=box(pivot,.055,.34,.07,rim,0,0,0,false);
        spoke.rotation.x=k*Math.PI/4;
      }
      vehicleWheels.push({mesh:wheel,front:sz<0});
    }
    return root;
  }
  
  function applyVehicleMaterials(model,index) {
    const spec=cars[index];
    const bodyMat=new THREE.MeshPhysicalMaterial({
      color:spec.color,metalness:.72,roughness:.24,clearcoat:1,clearcoatRoughness:.07,
      envMapIntensity:1.45
    });
    const rimMat=new THREE.MeshStandardMaterial({color:index===2?0x111820:0xd2d9dd,metalness:.96,roughness:.2});
    const glassMat=new THREE.MeshPhysicalMaterial({color:0x172b3b,metalness:.16,roughness:.08,clearcoat:1,transparent:true,opacity:.94});
    model.traverse(obj=>{
      if(!obj.isMesh)return;
      obj.castShadow=true;obj.receiveShadow=true;
      const n=(obj.name||"").toLowerCase();
      const materialNames=(Array.isArray(obj.material)?obj.material:[obj.material])
        .filter(Boolean).map(m=>(m.name||"").toLowerCase()).join(" ");
      if(n==="body"||n.includes("body")||materialNames.includes("body")||materialNames.includes("paint")) obj.material=bodyMat;
      else if(n.startsWith("rim_")||n.includes("rim")) obj.material=rimMat;
      else if(n==="glass"||n.includes("glass")||materialNames.includes("glass")) obj.material=glassMat;
      else if(n==="trim"||n.includes("trim")) obj.material=material(0x151c22,.3,.78);
      else if(Array.isArray(obj.material)) obj.material=obj.material.map(m=>m.clone());
      else if(obj.material) obj.material=obj.material.clone();
    });
  }
  function addVariantKit(root,index) {
    const spec=cars[index];
    const dark=material(0x111a21,.35,.72);
    const carbon=material(0x202a31,.3,.82);
    const accent=new THREE.MeshStandardMaterial({color:spec.color,metalness:.58,roughness:.24,emissive:spec.color,emissiveIntensity:.18});
    // Shared front splitter, side sills and rear diffuser.
    box(root,2.02,.09,.5,carbon,0,.39,-2.14,false);
    box(root,1.95,.12,.42,carbon,0,.4,2.12,false);
    for(const side of [-1,1]) {
      box(root,.12,.13,1.65,carbon,side*.99,.48,.12,false);
      box(root,.18,.08,.62,accent,side*.94,.68,-1.35,false);
    }
    if(spec.wing===1) {
      // Track package: raised two-post rear wing.
      box(root,1.98,.11,.34,carbon,0,1.28,1.86,false);
      for(const x of [-.72,.72])box(root,.1,.48,.12,carbon,x,1.05,1.82,false);
      box(root,2.0,.09,.3,accent,0,1.54,1.86,false);
    } else if(spec.wing===2) {
      // Grand-tourer ducktail spoiler.
      box(root,1.62,.1,.28,accent,0,1.12,1.96,false);
    } else if(spec.wing===3) {
      // Hyper-sport kit with a wider rear aero blade and front canards.
      box(root,2.12,.1,.38,carbon,0,1.31,1.88,false);
      for(const x of [-.78,.78])box(root,.11,.5,.12,carbon,x,1.08,1.84,false);
      box(root,2.12,.08,.3,accent,0,1.58,1.88,false);
      for(const side of [-1,1])box(root,.38,.08,.34,accent,side*.92,.55,-1.82,false);
    }
  }
  
  function normaliseModel(source) {
    const model=source.clone(true);
    model.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model);
    const size=bounds.getSize(new THREE.Vector3());
    const center=bounds.getCenter(new THREE.Vector3());
    const front=model.getObjectByName("wheel_fl");
    const rear=model.getObjectByName("wheel_rl");
    let correction=0;
    if(front && rear) {
      const f=front.getWorldPosition(new THREE.Vector3());
      const r=rear.getWorldPosition(new THREE.Vector3());
      const dir=f.sub(r);
      correction=Math.atan2(dir.x,-dir.z);
    } else if(size.x>size.z) correction=Math.PI/2;
    model.position.set(-center.x,-bounds.min.y,-center.z);
    const scale=4.55/Math.max(size.x,size.z);
    model.scale.setScalar(scale);
    const wrapper=new THREE.Group();
    wrapper.rotation.y=correction;
    wrapper.add(model);
    return {wrapper,model,scale};
  }
  function makePlayerVehicle(index) {
    const root=new THREE.Group();
    root.name="TurboCityPlayerCar";
    vehicleWheels=[];
    brakeLights=[];
    if(vehicleTemplate) {
      const normal=normaliseModel(vehicleTemplate);
      applyVehicleMaterials(normal.model,index);
      root.add(normal.wrapper);
      for(const name of ["wheel_fl","wheel_fr","wheel_rl","wheel_rr"]) {
        const wheel=normal.model.getObjectByName(name);
        if(wheel)vehicleWheels.push({mesh:wheel,front:name.includes("_f")});
      }
      addVariantKit(root,index);
    } else {
      const fallback=buildFallbackVehicle(index);
      root.add(fallback);
    }
    const shadowCanvas=document.createElement("canvas");
    shadowCanvas.width=128;shadowCanvas.height=256;
    const shadowCtx=shadowCanvas.getContext("2d");
    const shadowGradient=shadowCtx.createRadialGradient(64,128,12,64,128,124);
    shadowGradient.addColorStop(0,"rgba(0,0,0,.48)");
    shadowGradient.addColorStop(.42,"rgba(0,0,0,.28)");
    shadowGradient.addColorStop(1,"rgba(0,0,0,0)");
    shadowCtx.fillStyle=shadowGradient;shadowCtx.fillRect(0,0,128,256);
    const softShadowTexture=new THREE.CanvasTexture(shadowCanvas);
    const softShadow=new THREE.Mesh(new THREE.PlaneGeometry(3.3,5.5),new THREE.MeshBasicMaterial({
      map:softShadowTexture,transparent:true,depthWrite:false,toneMapped:false
    }));
    softShadow.rotation.x=-Math.PI/2;softShadow.position.y=.018;softShadow.renderOrder=2;root.add(softShadow);
    if(vehicleTemplate) {
      const aoTexture=new THREE.TextureLoader().load("https://threejs.org/examples/models/gltf/ferrari_ao.png");
      aoTexture.colorSpace=THREE.NoColorSpace;
      const aoShadow=new THREE.Mesh(
        new THREE.PlaneGeometry(2.62,5.2),
        new THREE.MeshBasicMaterial({map:aoTexture,blending:THREE.MultiplyBlending,transparent:true,opacity:.36,toneMapped:false,depthWrite:false})
      );
      aoShadow.rotation.x=-Math.PI/2;aoShadow.position.y=.025;aoShadow.renderOrder=3;root.add(aoShadow);
    }
  
    const rearLampMat=new THREE.MeshStandardMaterial({color:0x8c1825,emissive:0xff1834,emissiveIntensity:.75,roughness:.3});
    for(const side of [-1,1]) {
      const lamp=new THREE.Mesh(new THREE.BoxGeometry(.48,.14,.08),rearLampMat.clone());
      lamp.position.set(side*.66,.78,2.23);root.add(lamp);brakeLights.push(lamp);
      const exhaust=new THREE.Mesh(new THREE.CylinderGeometry(.095,.11,.22,12),material(0x69737b,.24,.88));
      exhaust.rotation.x=Math.PI/2;exhaust.position.set(side*.47,.36,2.25);root.add(exhaust);
    }
    playerLight=new THREE.PointLight(cars[index].color,1.35,7);
    playerLight.position.set(0,.35,0);root.add(playerLight);
    root.traverse(obj=>{if(obj.isMesh)obj.frustumCulled=true;});
    scene.add(root);
    return root;
  }
  
  async function loadCarModel() {
    if(isSmokeMode) {
      vehicleTemplate=null;
      fallbackCar=true;
      return;
    }
    const loader=new GLTFLoader();
    const draco=new DRACOLoader();
    draco.setDecoderPath(DRACO_PATH);
    loader.setDRACOLoader(draco);
    try {
      setLoading(28,"LOADING VEHICLE MODEL…");
      let timeoutId;
      const modelRequest=loader.loadAsync(CAR_MODEL_URL,(event)=>{
        if(event.total)setLoading(28+Math.round(event.loaded/event.total*18),"LOADING VEHICLE MODEL…");
      });
      const modelTimeout=new Promise((_,reject)=>{
        timeoutId=window.setTimeout(()=>reject(new Error("Vehicle model load timed out")),12000);
      });
      let gltf;
      try {
        gltf=await Promise.race([modelRequest,modelTimeout]);
      } finally {
        window.clearTimeout(timeoutId);
      }
      vehicleTemplate=gltf.scene.children[0]||gltf.scene;
      vehicleTemplate.traverse(obj=>{if(obj.isMesh){obj.castShadow=true;obj.receiveShadow=true;}});
      draco.dispose();
    } catch(err) {
      console.warn("Vehicle model could not be loaded. Using the built-in vehicle model.",err);
      draco.dispose();
      vehicleTemplate=null;
      fallbackCar=true;
    }
  }
  
  
  return { loadCarModel, makePlayerVehicle, getWheels:()=>vehicleWheels, getBrakeLights:()=>brakeLights, getPlayerLight:()=>playerLight, isUsingFallback:()=>fallbackCar };
}
