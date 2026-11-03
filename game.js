import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Sky } from "three/addons/objects/Sky.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const $ = (id) => document.getElementById(id);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const damp = (a, b, speed, dt) => THREE.MathUtils.damp(a, b, speed, dt);
const rand = (min, max) => min + Math.random() * (max - min);
const ROAD_SPACING = 160;
const WORLD_LIMIT = 555;
const CAR_MODEL_URL = "https://threejs.org/examples/models/gltf/ferrari.glb";
const DRACO_PATH = "https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/libs/draco/";

const cars = [
  { name:"RAX VELOCE", type:"MID-ENGINE SUPERCAR", color:0xf02e4f, top:286, accel:92, handling:88, power:25.5, grip:8.2, steer:1.92, wing:0 },
  { name:"RAX TEMPEST", type:"TRACK SPEC PERFORMANCE", color:0x15b9d2, top:318, accel:97, handling:94, power:29.0, grip:9.4, steer:2.12, wing:1 },
  { name:"RAX NOIR", type:"GRAND TOURING COUPE", color:0x353d51, top:302, accel:90, handling:86, power:26.5, grip:7.8, steer:1.82, wing:2 },
  { name:"RAX SOLAR", type:"HYPER SPORT CONCEPT", color:0xffa52c, top:342, accel:99, handling:91, power:31.5, grip:8.6, steer:1.98, wing:3 }
];

const input = { gas:false, brake:false, reverse:false, left:false, right:false };
const keys = Object.create(null);
// Optional browser-test diagnostics; disabled for normal visitors.
if (new URLSearchParams(window.location.search).has("ciDebug")) {
  window.__turboCityDebug = () => {
    const forward = new THREE.Vector3(Math.sin(world.yaw),0,-Math.cos(world.yaw));
    return {
      keys:{...keys}, input:{...input},
      velocity:{x:world.velocity.x,y:world.velocity.y,z:world.velocity.z},
      forwardSpeed:world.velocity.dot(forward),
      yaw:world.yaw, started:world.started, paused:world.paused,
      frameCount:world.frameCount, physicsTicks:world.physicsTicks, lastFrameDt:world.lastFrameDt
    };
  };
}
const world = {
  buildings: [], lamps: [], stars: [], obstacles: [], gates: [], traffic: [], windows: [],
  citySeed: 7183, score:0, collected:0, raceActive:false, raceStart:0, raceIndex:0,
  frameCount:0, physicsTicks:0, lastFrameDt:0,
  route:[], mode:"free", toastTimer:0, started:false, paused:false, cameraMode:0,
  yaw:0, speed:0, lateral:0, distance:0, prevPosition:new THREE.Vector3(),
  velocity:new THREE.Vector3(), safePosition:new THREE.Vector3(), safeYaw:0, safeTimer:0, steering:0, audio:null, soundStarted:false
};

let renderer, composer, scene, camera, clock, player, playerVisual, vehicleTemplate, vehicleWheels=[], brakeLights=[];
let playerMaterial, playerLight, pmrem, previewTime=0, lastFrame=0, loadingDone=false;
let fallbackCar = false;
let currentCarIndex = 0;
let activeGateObjects = [];

function setLoading(pct, text) {
  $("loadbar").style.width = pct + "%";
  $("loadtext").textContent = text;
}
function showError(message) {
  $("error").textContent = message;
  $("error").style.display = "block";
}
function toast(message, duration=2.2) {
  const el = $("toast");
  el.textContent = message;
  el.style.opacity = "1";
  world.toastTimer = duration;
}
function material(color, roughness=.7, metalness=.05, extra={}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}
function box(parent, w, h, d, mat, x, y, z, cast=true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  mesh.position.set(x,y,z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function cylinder(parent, radiusTop, radiusBottom, height, mat, x,y,z, segments=10) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop,radiusBottom,height,segments),mat);
  mesh.position.set(x,y,z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeNoiseTexture(base, fleck, seed=1) {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = base; ctx.fillRect(0,0,512,512);
  let s = seed >>> 0;
  const random = () => { s = (1664525*s + 1013904223) >>> 0; return s/4294967296; };
  for (let i=0;i<14500;i++) {
    const x=random()*512, y=random()*512, a=.035+random()*.12;
    ctx.globalAlpha=a; ctx.fillStyle=fleck;
    ctx.fillRect(x,y,random()*2.4+.3,random()*2.4+.3);
  }
  ctx.globalAlpha=1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}
function makeSky() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x9ab7c8, 360, 1280);
  const sky = new Sky();
  sky.scale.setScalar(12000);
  scene.add(sky);
  const u = sky.material.uniforms;
  u.turbidity.value = 5.4;
  u.rayleigh.value = 2.4;
  u.mieCoefficient.value = .005;
  u.mieDirectionalG.value = .78;
  const sun = new THREE.Vector3();
  const phi = THREE.MathUtils.degToRad(89 - 23);
  const theta = THREE.MathUtils.degToRad(180);
  sun.setFromSphericalCoords(1,phi,theta);
  u.sunPosition.value.copy(sun);
  scene.add(new THREE.HemisphereLight(0xe7f5ff,0x59665f,1.75));
  const key = new THREE.DirectionalLight(0xffe3bf,3.25);
  key.position.copy(sun).multiplyScalar(430);
  key.castShadow = true;
  key.shadow.mapSize.set(2048,2048);
  key.shadow.camera.left = -320;
  key.shadow.camera.right = 320;
  key.shadow.camera.top = 320;
  key.shadow.camera.bottom = -320;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 900;
  key.shadow.bias = -.00018;
  key.shadow.normalBias = .035;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x91cfff,.65);
  fill.position.set(200,110,-180);
  scene.add(fill);
}

function buildRenderer() {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
    depth: true
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth<800 ? 1.5 : 2));
  renderer.setSize(window.innerWidth,window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $("game").appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(61,window.innerWidth/window.innerHeight,.08,1900);
  camera.position.set(11,7,15);
  camera.lookAt(0,0,0);

  try {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene,camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth,window.innerHeight),.23,.62,.86));
    composer.addPass(new OutputPass());
  } catch (err) {
    console.warn("Post-processing unavailable; using direct renderer.",err);
    composer = null;
  }
}

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

function signTexture(text, accent="#32d9f1") {
  const c=document.createElement("canvas"); c.width=512; c.height=128;
  const ctx=c.getContext("2d");
  ctx.fillStyle="#07131f";ctx.fillRect(0,0,512,128);
  ctx.strokeStyle=accent;ctx.lineWidth=7;ctx.strokeRect(7,7,498,114);
  ctx.fillStyle=accent;ctx.font="900 54px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(text,256,65);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}

function addCityBuilding(x,z,w,d,h,index,windowMatrices) {
  const colors=[0x78858e,0x5d7180,0x77828a,0x4b6070,0x89918f,0x566573,0x6e7b85];
  const bodyMat=material(colors[index%colors.length],.78,.16);
  const base=box(scene,w,h,d,bodyMat,x,h/2,z);
  world.buildings.push({x,z,w,d,mesh:base});
  // Ground-floor plinth and dark rooftop cap make silhouettes less toy-like.
  box(scene,w+1.2,1.4,d+1.2,material(0x39444b,.9),x,.7,z);
  box(scene,w*.96,.8,d*.96,material(0x35424b,.65,.32),x,h+.35,z);
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
  // Rooftop plant rooms, ventilation units and antennas.
  const rooftopMat=material(0x46515a,.82,.25);
  const unitCount=1+(index%3);
  for(let u=0;u<unitCount;u++) {
    const ux=x+(u-unitCount/2)*w*.23;
    const uz=z+(u%2===0?1:-1)*d*.18;
    box(scene,w*.15,1.5,d*.18,rooftopMat,ux,h+1.05,uz);
    box(scene,w*.1,.18,d*.12,material(0x252f37,.5),ux,h+1.9,uz);
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

function makeTree(x,z,scale=1) {
  const trunkMat=material(0x69513b,1),leafMats=[material(0x2f6f4b,1),material(0x3f8258,1),material(0x477d51,1)];
  const trunk=cylinder(scene,.22*scale,.34*scale,3.6*scale,trunkMat,x,1.8*scale,z,7);
  const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(2.35*scale,2),leafMats[Math.floor((x+z+1000)%3)]);
  crown.position.set(x,4.3*scale,z);crown.castShadow=true;scene.add(crown);
  const crown2=new THREE.Mesh(new THREE.IcosahedronGeometry(1.45*scale,1),leafMats[1]);
  crown2.position.set(x+.7*scale,4.7*scale,z+.4*scale);crown2.castShadow=true;scene.add(crown2);
}
function buildParks() {
  const parkMat=material(0x58765a,.98);
  const parkCells=[[-240,240],[-400,-80],[240,240]];
  for(const [x,z] of parkCells) {
    const park=new THREE.Mesh(new THREE.PlaneGeometry(90,88),parkMat);
    park.rotation.x=-Math.PI/2;park.position.set(x,.015,z);scene.add(park);
    for(let i=0;i<18;i++) makeTree(x+rand(-39,39),z+rand(-38,38),rand(.72,1.05));
    // Paths and benches.
    const path=box(scene,4,.08,74,material(0xb9b7a7,.95),x,.07,z,false);
    for(let i=0;i<3;i++) {
      box(scene,3.3,.25,.45,material(0x64462e,.85),x+rand(-30,30),.45,z+rand(-30,30));
      cylinder(scene,.08,.08,.8,material(0x333b3d),x,.4,z+rand(-30,30),8);
    }
  }
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
  let seed=71;
  const parkBlocks=new Set(["-2,1","-3,-1","1,1"]);
  for(let gx=-3;gx<=2;gx++) for(let gz=-3;gz<=2;gz++) {
    // Keep the park blocks and skill course open.
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
      addCityBuilding(x,z,w,d,h,seed,windowMatrices);
    }
  }
  buildWindows(windowMatrices);
  buildParks();
  buildStreetFurniture();
}

function addTrainingCone(x,z,index) {
  const group=new THREE.Group();
  const base=material(0x252d32,.82);
  const orange=material(index%2===0?0xff7437:0xff9b37,.72,.05);
  const white=material(0xf0ece1,.7,.05);
  const foot= new THREE.Mesh(new THREE.CylinderGeometry(.72,.78,.16,16),base);
  foot.position.y=.08;group.add(foot);
  const cone=new THREE.Mesh(new THREE.ConeGeometry(.48,1.55,16),orange);
  cone.position.y=.92;cone.castShadow=true;group.add(cone);
  const stripe=new THREE.Mesh(new THREE.CylinderGeometry(.34,.42,.18,16),white);
  stripe.position.y=.92;group.add(stripe);
  group.position.set(x,.02,z);scene.add(group);
  world.obstacles.push({x,z,radius:.95,group,hit:false});
}

function buildSkillDistrict() {
  // A precision-driving practice area with a marked slalom and checkpoint lanes.
  const cx=400,cz=-400;
  const platform=new THREE.Mesh(new THREE.PlaneGeometry(132,132),material(0x4c555b,.95));
  platform.rotation.x=-Math.PI/2;platform.position.set(cx,.02,cz);platform.receiveShadow=true;scene.add(platform);
  const borderMat=material(0xe8e5db,.55,.2);
  for(const side of [-1,1]) {
    box(scene,1.0,.65,132,borderMat,cx+side*66,.35,cz,false);
    box(scene,132,.65,1.0,borderMat,cx,.35,cz+side*66,false);
  }
  const laneMat=new THREE.MeshStandardMaterial({color:0x31d8ed,emissive:0x0c6171,emissiveIntensity:.45,roughness:.48});
  for(let i=-2;i<=2;i++) box(scene,.18,.035,116,laneMat,cx+i*20,.07,cz,false);
  for(let row=0;row<7;row++) {
    const z=cz+29-row*15;
    const offset=(row%2===0)?-13:13;
    addTrainingCone(cx+offset,z,row);
    addTrainingCone(cx-offset,z,row+1);
  }
  // Checkpoint arches guide the driver through the marked course.
  for(let i=0;i<4;i++) {
    const z=cz+18-i*34;
    const x=cx+(i%2===0?-8:8);
    const postMat=material(0xd5e0e4,.48,.5);
    box(scene,.32,4.2,.32,postMat,x-7,2.1,z,false);
    box(scene,.32,4.2,.32,postMat,x+7,2.1,z,false);
    const beam=box(scene,14,.28,.4,laneMat,x,4.15,z,false);
    const marker=new THREE.Mesh(new THREE.TorusGeometry(4.6,.12,8,32),new THREE.MeshStandardMaterial({color:0x31d8ed,emissive:0x0a7185,emissiveIntensity:.75}));
    marker.position.set(x,2.25,z);scene.add(marker);
  }
  const sign=box(scene,18,3,.5,material(0x1a242c,.5,.3),cx,8,cz-61,false);
  const glow=new THREE.Mesh(new THREE.PlaneGeometry(17,2.5),new THREE.MeshBasicMaterial({map:signTexture("SKILL COURSE","#35dff2"),transparent:true,side:THREE.DoubleSide}));
  glow.position.set(cx,8,cz-60.72);scene.add(glow);
}

function starShape() {
  const shape=new THREE.Shape();
  for(let i=0;i<10;i++) {
    const r=i%2===0?1:.45;
    const a=(i/10)*Math.PI*2-Math.PI/2;
    const x=Math.cos(a)*r,y=Math.sin(a)*r;
    if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);
  }
  shape.closePath();return shape;
}
function addStar(x,y,z,index) {
  const gold=new THREE.MeshStandardMaterial({color:0xffd15a,metalness:.56,roughness:.24,emissive:0x80500a,emissiveIntensity:.5,side:THREE.DoubleSide});
  const group=new THREE.Group();
  const core=new THREE.Mesh(new THREE.ExtrudeGeometry(starShape(),{depth:.16,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.06,bevelThickness:.05}),gold);
  core.scale.set(1.12,1.12,1.12);core.castShadow=true;group.add(core);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.05,.045,7,28),new THREE.MeshStandardMaterial({color:0xfff1b2,emissive:0xffc44e,emissiveIntensity:1.0}));
  ring.rotation.x=Math.PI/2;ring.position.y=-.08;group.add(ring);
  const glow=new THREE.PointLight(0xffc44c,.7,9);glow.position.y=.2;group.add(glow);
  group.position.set(x,y,z);group.userData.baseY=y;group.userData.id=index;
  scene.add(group);world.stars.push({group,active:true});
}
function buildCollectibles() {
  const points=[
    [-260,2.2,-240],[-160,2.2,-300],[0,2.2,-270],[160,2.2,-300],[270,2.2,-160],
    [300,2.2,0],[160,2.2,160],[0,2.2,260],[-160,2.2,280],[-300,2.2,160],
    [-390,2.2,-160],[390,2.2,160],[-390,2.2,390],[390,2.2,-260],
    [400,2.2,-390],[400,2.2,-430],[372,2.2,-420],[428,2.2,-420],
    [240,2.2,-420],[0,2.2,-440],[-240,2.2,420],[-420,2.2,0],
    [230,2.2,420],[-80,2.2,120],[80,2.2,-120],[320,2.2,320]
  ];
  points.forEach((p,i)=>addStar(p[0],p[1],p[2],i));
}

// The pickup animation is cosmetic; collection is checked against the car's
// ground position so it remains reliable at higher arcade driving speeds.
function animateCollectibles(dt) {
  const t=performance.now()*.001;
  for(const star of world.stars) {
    if(!star.active)continue;
    const g=star.group;
    g.rotation.y+=dt*1.25;
    g.position.y=g.userData.baseY+Math.sin(t*2.1+g.userData.id*.7)*.22;
  }
}
function collectStars() {
  if(!player)return;
  const radiusSq=4.6*4.6;
  for(const star of world.stars) {
    if(!star.active)continue;
    const dx=player.position.x-star.group.position.x;
    const dz=player.position.z-star.group.position.z;
    if(dx*dx+dz*dz<=radiusSq) {
      star.active=false;
      star.group.visible=false;
      world.collected+=1;
      world.score+=100;
      toast("STAR COLLECTED  +100",1.15);
    }
  }
}

function createGate(position,index,finish=false) {
  const group=new THREE.Group();
  const ring=new THREE.Mesh(new THREE.TorusGeometry(5.2,.38,12,48),new THREE.MeshStandardMaterial({
    color:finish?0xffbd49:0x27d9ee,metalness:.45,roughness:.25,
    emissive:finish?0x8c4d12:0x075d6c,emissiveIntensity:1.1
  }));
  ring.position.y=5.5;group.add(ring);
  const postMat=material(finish?0xffbd49:0x38d9ee,.35,.5);
  cylinder(group,.18,.22,5.4,postMat,-5.2,2.7,0,10);
  cylinder(group,.18,.22,5.4,postMat,5.2,2.7,0,10);
  group.position.copy(position);scene.add(group);
  world.gates.push({group,position:position.clone(),index,finish,active:false});
}
function clearRaceGates() {
  for(const g of world.gates) scene.remove(g.group);
  world.gates=[];
}
function prepareRace(skillCourse=false) {
  clearRaceGates();
  world.route=skillCourse?[
    new THREE.Vector3(400,0,-378),
    new THREE.Vector3(388,0,-412),
    new THREE.Vector3(412,0,-446),
    new THREE.Vector3(400,0,-480)
  ]:[
    new THREE.Vector3(0,0,-72),
    new THREE.Vector3(150,0,-158),
    new THREE.Vector3(300,0,-158),
    new THREE.Vector3(300,0,0),
    new THREE.Vector3(150,0,158),
    new THREE.Vector3(0,0,72)
  ];
  world.route.forEach((p,i)=>createGate(p,i,i===world.route.length-1));
  world.raceActive=true;world.raceStart=performance.now();world.raceIndex=0;
  if(world.gates[0])world.gates[0].active=true;
}
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

function buildWorld() {
  buildGroundAndRoads();
  buildCity();
  buildSkillDistrict();
  buildCollectibles();
  buildTraffic();
}

function buildFallbackVehicle() {
  fallbackCar=true;
  const root=new THREE.Group();
  const paint=new THREE.MeshPhysicalMaterial({color:cars[currentCarIndex].color,metalness:.72,roughness:.23,clearcoat:1,clearcoatRoughness:.08});
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
    const fallback=buildFallbackVehicle();
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

function updateGarage() {
  const spec=cars[currentCarIndex];
  $("car-name").textContent=spec.name;
  $("car-type").textContent=spec.type;
  $("car-swatch").style.background="#" + spec.color.toString(16).padStart(6,"0");
  $("car-swatch").style.boxShadow="0 5px 20px #0008,0 0 17px #" + spec.color.toString(16).padStart(6,"0") + "77";
  $("car-count").textContent=String(currentCarIndex+1).padStart(2,"0")+" / "+String(cars.length).padStart(2,"0");
  $("stat-speed").textContent=spec.top;
  $("stat-acc").textContent=spec.accel;
  $("stat-hand").textContent=spec.handling;
}
function replacePlayerVehicle() {
  if(player)scene.remove(player);
  player=makePlayerVehicle(currentCarIndex);
  player.position.set(0,0,0);
  if(world.started)placeAtModeStart();
}
$("prev-car").addEventListener("click",()=>{
  currentCarIndex=(currentCarIndex+cars.length-1)%cars.length;updateGarage();replacePlayerVehicle();
});
$("next-car").addEventListener("click",()=>{
  currentCarIndex=(currentCarIndex+1)%cars.length;updateGarage();replacePlayerVehicle();
});

function selectMode(mode) {
  world.mode=mode;
  document.querySelectorAll(".mode").forEach(btn=>btn.classList.toggle("active",btn.dataset.mode===mode));
}
document.querySelectorAll(".mode").forEach(btn=>btn.addEventListener("click",()=>selectMode(btn.dataset.mode)));

function placeAtModeStart() {
  const spawn=world.mode==="skill"?new THREE.Vector3(400,0,-330):new THREE.Vector3(0,0,0);
  player.position.copy(spawn);
  world.prevPosition.copy(spawn);
  world.safePosition.copy(spawn);
  world.safeYaw=0;
  world.safeTimer=0;
  world.velocity.set(0,0,0);
  world.yaw=0;
  world.speed=0;world.lateral=0;world.distance=0;
  player.rotation.set(0,world.yaw,0);
  if(world.mode==="sprint") {
    prepareRace();
    $("mission-title").textContent="CITY SPRINT";
    $("mission-sub").textContent="Pass through every checkpoint";
    toast("SPRINT START — GO!");
  } else if(world.mode==="skill") {
    world.obstacles.forEach(o=>{o.hit=false;o.group.visible=true;});
    prepareRace(true);
    $("mission-title").textContent="SKILL COURSE";
    $("mission-sub").textContent="Pass each checkpoint and avoid the cones";
    toast("SKILL COURSE — FOLLOW THE MARKERS");
  } else {
    clearRaceGates();world.raceActive=false;
    $("mission-title").textContent="FREE DRIVE";
    $("mission-sub").textContent="Explore the city · Collect stars";
    toast("WELCOME TO TURBO CITY");
  }
}

function startDrive() {
  if(!loadingDone)return;
  world.started=true;world.paused=false;
  $("garage").style.display="none";$("hud").style.display="block";$("pause-screen").style.display="none";
  placeAtModeStart();
  clock.start();
  if(!world.soundStarted)startAudio();
}
$("start-button").addEventListener("click",startDrive);

function pauseGame(force) {
  if(!world.started)return;
  world.paused=typeof force==="boolean"?force:!world.paused;
  $("pause-screen").style.display=world.paused?"grid":"none";
  if(world.paused) {
    Object.keys(input).forEach(k=>input[k]=false);
    Object.keys(keys).forEach(k=>keys[k]=false);
  } else {
    clock.getDelta();
  }
}
$("pause-button").addEventListener("click",()=>pauseGame(true));
$("resume-button").addEventListener("click",()=>pauseGame(false));
$("pause-menu").addEventListener("click",()=>{
  world.started=false;world.paused=false;
  $("pause-screen").style.display="none";$("hud").style.display="none";$("garage").style.display="flex";
  selectMode("free");placeAtModeStart();
});
$("camera-button").addEventListener("click",toggleCamera);
$("fullscreen-button").addEventListener("click",async()=>{
  try {
    if(!document.fullscreenElement)await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch(err){toast("FULLSCREEN NOT AVAILABLE");}
});

function toggleCamera() {
  world.cameraMode=(world.cameraMode+1)%3;
  const labels=["CHASE CAM","FAR CHASE","HOOD CAM"];
  $("camera-button").textContent=labels[world.cameraMode]+" [C]";
  toast(labels[world.cameraMode],1.1);
}
function recoverCar() {
  if(!player)return;
  player.position.copy(world.safePosition);
  world.yaw=world.safeYaw;
  world.velocity.set(0,0,0);
  world.speed=0;world.lateral=0;
  world.safeTimer=0;
  player.rotation.set(0,world.safeYaw,0);
  toast("VEHICLE RECOVERED");
}

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
    if(e.code==="Enter" && world.paused)pauseGame(false);
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

function startAudio() {
  try {
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    const ctx=new AC();
    const osc=ctx.createOscillator();
    const gain=ctx.createGain();
    const filter=ctx.createBiquadFilter();
    osc.type="sawtooth";osc.frequency.value=55;
    filter.type="lowpass";filter.frequency.value=330;
    gain.gain.value=.0001;
    osc.connect(filter);filter.connect(gain);gain.connect(ctx.destination);osc.start();
    world.audio={ctx,osc,gain,filter};
    world.soundStarted=true;
  } catch(err){console.warn("Audio could not start",err);}
}
function updateAudio() {
  if(!world.audio)return;
  const ctx=world.audio.ctx;
  const target=(world.paused||!world.started)?0.0001:(0.012+Math.abs(world.speed)*0.00022);
  world.audio.gain.gain.setTargetAtTime(target,ctx.currentTime,.08);
  world.audio.osc.frequency.setTargetAtTime(48+Math.abs(world.speed)*2.2,ctx.currentTime,.06);
  world.audio.filter.frequency.setTargetAtTime(180+Math.abs(world.speed)*10,ctx.currentTime,.08);
}

function updatePhysics(dt) {
  if(!player)return;
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
    if(forwardSpeed>0.05) world.velocity.addScaledVector(forward,-Math.min(forwardSpeed,34*dt));
    else if(forwardSpeed<-.05) world.velocity.addScaledVector(forward,Math.min(-forwardSpeed,34*dt));
  } else if(controls.reverse) {
    // S / Down first slows the car, then gently engages reverse.
    if(forwardSpeed>0.8) world.velocity.addScaledVector(forward,-Math.min(forwardSpeed,28*dt));
    else if(forwardSpeed<-.8) world.velocity.addScaledVector(forward,Math.min(-forwardSpeed,22*dt));
    else world.velocity.addScaledVector(forward,-spec.power*.5*dt);
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

function updateTraffic(dt) {
  for(const t of world.traffic) {
    t.z+=t.speed*t.direction*dt;
    if(t.z>520)t.z=-520;
    if(t.z<-520)t.z=520;
    t.group.position.z=t.z;
    if(t.wheels) t.wheels.forEach(w=>{w.rotation.x+=t.speed*t.direction*dt/.34;});
  }
}
function updateCamera(dt) {
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
function tick() {
  requestAnimationFrame(tick);
  const dt=Math.min(clock.getDelta(),.04);
  world.frameCount++;
  world.lastFrameDt=dt;
  animateCollectibles(dt);
  if(world.started && !world.paused) {
    updatePhysics(dt);
    updateTraffic(dt);
    updateCamera(dt);
    drawMiniMap();
  } else if(!world.started && player) {
    previewTime+=dt*.18;
    camera.position.set(Math.sin(previewTime)*13,6.4,Math.cos(previewTime)*15);
    camera.lookAt(0,0,0);
    updateTraffic(dt*.25);
    if(vehicleWheels.length)vehicleWheels.forEach(w=>{if(w.mesh)w.mesh.rotation.x+=dt*.08;});
  }
  updateAudio();
  if(composer)composer.render();else renderer.render(scene,camera);
}
function onResize() {
  if(!renderer)return;
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,window.innerWidth<800?1.5:2));
  renderer.setSize(window.innerWidth,window.innerHeight);
  if(composer)composer.setSize(window.innerWidth,window.innerHeight);
}

async function init() {
  try {
    setLoading(5,"SETTING UP RENDERER…");
    makeSky();
    buildRenderer();
    const pmremGenerator=new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    pmrem=pmremGenerator.fromScene(new RoomEnvironment(renderer),.04).texture;
    scene.environment=pmrem;
    pmremGenerator.dispose();

    setLoading(14,"BUILDING CITY STREETS…");
    buildWorld();
    setLoading(26,"ADDING CITY ACTIVITIES…");
    await loadCarModel();
    setLoading(74,"PREPARING GARAGE…");
    updateGarage();
    replacePlayerVehicle();
    player.position.set(0,0,0);
    bindControls();
    window.addEventListener("resize",onResize);
    clock=new THREE.Clock();
    clock.start();
    loadingDone=true;
    $("start-button").disabled=false;
    $("start-button").textContent="START DRIVING  →";
    setLoading(100,"READY TO DRIVE");
    $("loading").style.display="none";
    $("mission-title").textContent="FREE DRIVE";
    tick();
  } catch(err) {
    console.error(err);
    showError("The 3D world could not start. Refresh the page or try a newer browser.");
    $("loadtext").textContent="INITIALISATION ERROR";
  }
}
init();