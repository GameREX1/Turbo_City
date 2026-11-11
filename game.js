import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { Sky } from "three/addons/objects/Sky.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CARS as cars, ROAD_SPACING, WORLD_LIMIT } from "./src/config/game.js";
import { getQualityPreset } from "./src/config/quality.js";
import { createRoadModule } from "./src/world/roads.js";
import { createBuildingModule } from "./src/world/buildings.js";
import { findTokyoRoadSpawn } from "./src/world/tokyo-spawn.js";
import { enhanceTokyoCity } from "./src/world/tokyo-visuals.js";
import { loadDowntownCity } from "./src/world/downtown-city.js";
import { createActivityModule } from "./src/world/activities.js";
import { createTrafficModule } from "./src/world/traffic.js";
import { createVehicleModule } from "./src/vehicles/car.js";
import { createControlsModule } from "./src/systems/controls.js";
import { createDrivingModule } from "./src/systems/driving.js";
import { createCameraModule } from "./src/systems/camera.js";

const $ = (id) => document.getElementById(id);
const queryFlags = new URLSearchParams(window.location.search);
const isSmokeMode = queryFlags.has("ciDebug");
const isVisualTestMode = queryFlags.has("ciVisual");
const isTestMode = isSmokeMode || isVisualTestMode;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const TOKYO_CITY_MODEL_URL = "https://tokyo-map-proxy.uk7186979.workers.dev/tokyo-city.glb";
const damp = (a, b, speed, dt) => THREE.MathUtils.damp(a, b, speed, dt);
const rand = (min, max) => min + Math.random() * (max - min);
const input = { gas:false, brake:false, reverse:false, left:false, right:false };
const keys = Object.create(null);
// Optional browser-test diagnostics; disabled for normal visitors.
if (isTestMode) {
  window.__turboCityDebug = () => {
    const forward = new THREE.Vector3(Math.sin(world.yaw),0,-Math.cos(world.yaw));
    const playerBox = player ? new THREE.Box3().setFromObject(player) : null;
    const playerSize = playerBox ? playerBox.getSize(new THREE.Vector3()) : null;
    return {
      keys:{...keys}, input:{...input},
      renderInfo:renderer?{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,pixelRatio:renderer.getPixelRatio()}:null,
      velocity:{x:world.velocity.x,y:world.velocity.y,z:world.velocity.z},
      position:player?{x:player.position.x,y:player.position.y,z:player.position.z}:null,
      safePosition:{x:world.safePosition.x,y:world.safePosition.y,z:world.safePosition.z},
      forwardSpeed:world.velocity.dot(forward),
      yaw:world.yaw, playerYaw:player?.rotation.y,
      cameraPosition:camera?{x:camera.position.x,y:camera.position.y,z:camera.position.z}:null,
      started:world.started, paused:world.paused,
      playerModel:player?.name||null, carIndex:currentCarIndex,
      playerBounds:playerSize?{length:Number(Math.max(playerSize.x,playerSize.z).toFixed(3)),width:Number(Math.min(playerSize.x,playerSize.z).toFixed(3)),height:Number(playerSize.y.toFixed(3))}:null,
      tokyoCityLoaded:Boolean(world.tokyoCity),
      tokyoSpawn:{x:world.tokyoSpawn.x,y:world.tokyoSpawn.y,z:world.tokyoSpawn.z},
      tokyoSpawnRoadVerified:world.tokyoSpawnRoadVerified,
      driveSurfaceY:world.driveSurfaceY,
      tokyoSpawnYaw:world.tokyoSpawnYaw,
      tokyoSpawnClearDistance:world.tokyoSpawnClearDistance,
      tokyoRoadMeshCount:world.tokyoRoadMeshCount,
      tokyoDrivableRoadMeshCount:world.tokyoDrivableRoadMeshCount,
      tokyoInferredRoadMeshCount:world.tokyoInferredRoadMeshCount,
      tokyoBuildingMeshCount:world.tokyoBuildingMeshCount,
      tokyoLaneMarkCount:world.tokyoLaneMarkCount,
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
  velocity:new THREE.Vector3(), safePosition:new THREE.Vector3(), safeYaw:0, safeTimer:0, steering:0, audio:null, soundStarted:false,
  tokyoSpawn:new THREE.Vector3(0,0,0), tokyoSpawnYaw:0, tokyoSpawnClearDistance:0,
  tokyoRoadMeshCount:0, tokyoInferredRoadMeshCount:0, tokyoDrivableRoadMeshCount:0,
  tokyoSpawnRoadVerified:false, driveSurfaceY:0,
  tokyoBuildingMeshCount:0, tokyoLaneMarkCount:0,
  tokyoCity:null, tokyoCityBounds:null,
  downtownCity:null, downtownSpawn:new THREE.Vector3(-28,0,0), downtownSpawnYaw:Math.PI/2,
  cityLimit:null, cityTileSpacing:null
};

if(isSmokeMode) {
  // Keep automated high-speed steering runs on a clear road, away from random traffic.
  window.__turboCityPrepareHighSpeed = () => {
    if(!player)return;
    player.position.set(0,0,-220);
    player.rotation.set(0,0,0);
    world.prevPosition.copy(player.position);
    world.safePosition.copy(player.position);
    world.yaw=0;
    world.safeYaw=0;
    world.velocity.set(0,0,0);
    world.speed=0;
    world.safeTimer=0;
    world.traffic.forEach((record,index)=>{
      record.x=5000+index*25;
      record.z=5000;
      record.group.position.set(record.x,.02,record.z);
    });
  };
}

let renderer, composer, scene, camera, clock, player, pmrem, sunLight;
let previewTime=0, loadingDone=false, selectedQuality="balanced";
let currentCarIndex=0; // Start with the uploaded Bugatti Divo.
let roadSystem, buildingSystem, activitySystem, trafficSystem, vehicleSystem;
let controlSystem, drivingSystem, cameraSystem;
let minimapAccumulator=0, audioAccumulator=0;

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

function createComposer() {
  if(composer){composer.dispose();composer=null;}
  if(isTestMode || !getQualityPreset(selectedQuality).bloom || !renderer || !camera || !scene)return;
  try {
    composer=new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene,camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth,window.innerHeight),.18,.55,.9));
    composer.addPass(new OutputPass());
  } catch(err) {
    console.warn("Bloom disabled because post-processing could not start.",err);
    composer=null;
  }
}
function applyQualitySettings() {
  if(!renderer)return;
  const quality=getQualityPreset(selectedQuality);
  renderer.setPixelRatio(isTestMode?0.5:Math.min(window.devicePixelRatio||1,quality.pixelRatio));
  renderer.setSize(isTestMode?320:window.innerWidth,isTestMode?200:window.innerHeight);
  renderer.shadowMap.enabled=!isTestMode&&quality.shadows;
  if(sunLight) {
    sunLight.shadow.mapSize.set(quality.shadowMapSize,quality.shadowMapSize);
    if(sunLight.shadow.map)sunLight.shadow.map.dispose();
    sunLight.shadow.map=null;
    sunLight.shadow.needsUpdate=true;
  }
  createComposer();
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
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return tex;
}
function loadOutdoorCarEnvironment() {
  if(isTestMode || !renderer || !scene)return;
  const loader=new RGBELoader();
  loader.load(
    "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/urban_street_01_1k.hdr",
    hdrTexture=>{
      if(!renderer || !scene) { hdrTexture.dispose(); return; }
      const generator=new THREE.PMREMGenerator(renderer);
      generator.compileEquirectangularShader();
      const nextEnvironment=generator.fromEquirectangular(hdrTexture);
      const previousEnvironment=pmrem;
      pmrem=nextEnvironment;
      scene.environment=nextEnvironment.texture;
      scene.environmentIntensity=1.18;
      hdrTexture.dispose();
      generator.dispose();
      if(previousEnvironment && previousEnvironment!==nextEnvironment)previousEnvironment.dispose();
    },
    undefined,
    error=>console.warn("Outdoor car-reflection HDRI unavailable; using the built-in fallback environment.",error)
  );
}

function makeSky() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xc0c8cb, 520, 1540);
  const sky = new Sky();
  sky.scale.setScalar(12000);
  scene.add(sky);
  const u = sky.material.uniforms;
  u.turbidity.value = 2.6;
  u.rayleigh.value = 1.45;
  u.mieCoefficient.value = .0022;
  u.mieDirectionalG.value = .72;
  const sun = new THREE.Vector3();
  const phi = THREE.MathUtils.degToRad(89 - 23);
  const theta = THREE.MathUtils.degToRad(180);
  sun.setFromSphericalCoords(1,phi,theta);
  u.sunPosition.value.copy(sun);
  scene.add(new THREE.HemisphereLight(0xf2f5f7,0x64675d,1.28));
  sunLight = new THREE.DirectionalLight(0xfff1d9,2.75);
  sunLight.position.copy(sun).multiplyScalar(430);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024,1024);
  sunLight.shadow.camera.left = -320;
  sunLight.shadow.camera.right = 320;
  sunLight.shadow.camera.top = 320;
  sunLight.shadow.camera.bottom = -320;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 900;
  sunLight.shadow.bias = -.00018;
  sunLight.shadow.normalBias = .035;
  scene.add(sunLight);
  const fill = new THREE.DirectionalLight(0xdce7ee,.32);
  fill.position.set(200,110,-180);
  scene.add(fill);
}

function buildRenderer() {
  const quality=getQualityPreset(selectedQuality);
  renderer = new THREE.WebGLRenderer({
    antialias: !isTestMode&&quality.antialias,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
    depth: true
  });
  renderer.setPixelRatio(isTestMode ? 0.5 : Math.min(window.devicePixelRatio || 1, quality.pixelRatio));
  renderer.setSize(isTestMode ? 320 : window.innerWidth,isTestMode ? 200 : window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = !isTestMode && quality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $("game").appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(61,window.innerWidth/window.innerHeight,.08,1900);
  camera.position.set(11,7,15);
  camera.lookAt(0,0,0);

  createComposer();
}

async function loadTokyoCity() {
  const loader = new GLTFLoader();

  const gltf = await new Promise((resolve, reject) => {
    loader.load(
      TOKYO_CITY_MODEL_URL,
      resolve,
      (event) => {
        if (event.total > 0) {
          const percent = Math.min(44, 14 + (event.loaded / event.total) * 30);
          setLoading(percent, "DOWNLOADING TOKYO CITY " +
            Math.round(event.loaded / 1048576) + " / " +
            Math.round(event.total / 1048576) + " MB…");
        } else {
          setLoading(24, "DOWNLOADING TOKYO CITY…");
        }
      },
      reject
    );
  });

  if (!gltf.scene) throw new Error("The Tokyo GLB did not contain a scene.");

  const cityRoot = gltf.scene;
  cityRoot.updateMatrixWorld(true);

  const originalBounds = new THREE.Box3().setFromObject(cityRoot);
  if (originalBounds.isEmpty()) throw new Error("The Tokyo GLB contains no visible geometry.");

  const originalSize = originalBounds.getSize(new THREE.Vector3());
  if (originalSize.x < 100 || originalSize.z < 100) {
    throw new Error("The Tokyo GLB is smaller than expected; check its scale.");
  }

  const originalCenter = originalBounds.getCenter(new THREE.Vector3());

  // The source asset is already metric and centered near its world origin.
  // Keep its authored vertical offset: shifting the absolute lowest mesh point
  // can lift the street surface above the car and leave the vehicle underground.
  cityRoot.position.x -= originalCenter.x;
  cityRoot.position.z -= originalCenter.z;
  cityRoot.updateMatrixWorld(true);

  world.buildings.length = 0;
  world.traffic.length = 0;

  let meshCount = 0;
  let colliderCount = 0;

  cityRoot.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;

    meshCount++;
    object.castShadow = false;
    object.receiveShadow = true;
    object.frustumCulled = true;

    // Create lightweight, approximate AABB collision boxes for building-sized
    // meshes. Large merged terrain/road meshes and thin road markings are excluded.
    if (!isTestMode && colliderCount < 2500) {
      const bounds = new THREE.Box3().setFromObject(object);
      if (!bounds.isEmpty()) {
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const buildingSized =
          size.x > 4 && size.z > 4 && size.y > 4 &&
          size.x < 180 && size.z < 180 && size.y < 1200;

        if (buildingSized) {
          world.buildings.push({
            x: center.x,
            z: center.z,
            w: size.x,
            d: size.z
          });
          colliderCount++;
        }
      }
    }
  });

  if (meshCount === 0) throw new Error("The Tokyo GLB contains no renderable meshes.");

  // Identify and style the imported asphalt first, then choose the spawn by
  // raycasting against the actual road triangles (not just open space).
  const visualStats = enhanceTokyoCity(cityRoot, scene, THREE, renderer);

  const spawn = findTokyoRoadSpawn(
    world.buildings,
    {
      minX: -originalSize.x * 0.5,
      maxX: originalSize.x * 0.5,
      minZ: -originalSize.z * 0.5,
      maxZ: originalSize.z * 0.5
    },
    {
      THREE,
      roadMeshes: visualStats.roadMeshes,
      maxRadius: Math.min(280, originalSize.x * 0.5 - 12, originalSize.z * 0.5 - 12),
      maxForwardDistance: 64,
      minForwardDistance: 18,
      vehicleClearance: 2.6
    }
  );

  if (!spawn) {
    throw new Error("No safe Tokyo road spawn was found. Building collisions were kept enabled.");
  }
  world.tokyoSpawn.set(spawn.x, Number.isFinite(spawn.y) ? spawn.y : 0, spawn.z);
  world.tokyoSpawnYaw = spawn.yaw;
  world.tokyoSpawnClearDistance = spawn.clearDistance;
  world.tokyoSpawnRoadVerified = Boolean(spawn.roadVerified);
  world.driveSurfaceY = world.tokyoSpawn.y;

  scene.add(cityRoot);
  world.tokyoCity = cityRoot;
  world.tokyoCityBounds = originalSize;

  world.tokyoRoadMeshCount = visualStats.roadMeshCount;
  world.tokyoInferredRoadMeshCount = visualStats.inferredRoadMeshCount;
  world.tokyoDrivableRoadMeshCount = visualStats.drivableRoadMeshCount;
  world.tokyoBuildingMeshCount = visualStats.buildingMeshCount;
  world.tokyoLaneMarkCount = visualStats.laneMarkCount;

  console.info("Turbo City: Tokyo map loaded and visually enhanced", {
    meshCount,
    colliderCount,
    width: originalSize.x,
    depth: originalSize.z,
    height: originalSize.y,
    spawn,
    visualStats
  });

  return { meshCount, colliderCount, size: originalSize, spawn, visualStats };
}

async function buildWorld() {
  // Browser automation remains on the deterministic procedural test world.
  // Normal players load the copied Downtown City Kit directly from this repo.
  if (isTestMode) {
    roadSystem.buildGroundAndRoads();
    buildingSystem.buildCity();
    activitySystem.buildSkillDistrict();
    activitySystem.buildCollectibles();
    trafficSystem.buildTraffic();
    scene.traverse((object) => {
      if (object.isMesh) object.castShadow = false;
    });
    return;
  }

  try {
    const result = await loadDowntownCity({ scene, world, setLoading });
    activitySystem.buildCollectibles();
    document.querySelectorAll('.mode[data-mode="skill"]').forEach((button) => {
      button.disabled = true;
      button.title = "Skill course is not yet aligned to the Downtown map.";
    });
    console.info("Downtown driving world ready.", result);
  } catch (error) {
    console.error("Downtown map failed to load; restoring the original procedural city.", error);
    if (world.downtownCity) scene.remove(world.downtownCity);
    world.downtownCity = null;
    world.cityLimit = null;
    world.cityTileSpacing = null;
    world.buildings.length = 0;
    world.traffic.length = 0;
    roadSystem.buildGroundAndRoads();
    buildingSystem.buildCity();
    activitySystem.buildSkillDistrict();
    activitySystem.buildCollectibles();
    trafficSystem.buildTraffic();
    showError("Downtown map could not load. The original city has been restored. " +
      (error?.message || "Check that the Downtown assets are present in this repository."));
  }

  if (!world.downtownCity) {
    scene.traverse((object) => {
      if (object.isMesh) object.castShadow = false;
    });
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
  player=vehicleSystem.makePlayerVehicle(currentCarIndex);
  player.position.set(0,0,0);
  if(world.started)placeAtModeStart();
}

function refreshLoadedPlayerVehicle() {
  if(!player)return;
  const position=player.position.clone();
  const rotation=player.rotation.clone();
  scene.remove(player);
  player=vehicleSystem.makePlayerVehicle(currentCarIndex);
  player.position.copy(position);
  player.rotation.copy(rotation);
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
  const spawn=world.mode==="skill"
    ? new THREE.Vector3(400,0,-330)
    : (world.downtownCity ? world.downtownSpawn.clone()
      : world.tokyoCity ? world.tokyoSpawn.clone() : new THREE.Vector3(0,0,0));
  player.position.copy(spawn);
  world.prevPosition.copy(spawn);
  world.safePosition.copy(spawn);
  world.yaw=world.downtownCity && world.mode!== "skill" ? world.downtownSpawnYaw\n    : world.tokyoCity && world.mode!== "skill" ? world.tokyoSpawnYaw : 0;
  world.driveSurfaceY=world.mode==="skill"?0:spawn.y;
  world.safeYaw=world.yaw;
  world.safeTimer=0;
  world.velocity.set(0,0,0);
  world.speed=0;world.lateral=0;world.distance=0;
  // Keep the road direction selected by findTokyoRoadSpawn. Resetting yaw
  // here made the car face north even when the detected open road ran east/west,
  // so it could spawn directly facing a building and appear unable to move.
  player.rotation.set(0,-world.yaw,0);
  if(world.mode==="sprint") {
    activitySystem.prepareRace();
    $("mission-title").textContent="CITY SPRINT";
    $("mission-sub").textContent="Pass through every checkpoint";
    toast("SPRINT START — GO!");
  } else if(world.mode==="skill") {
    world.obstacles.forEach(o=>{o.hit=false;o.group.visible=true;});
    activitySystem.prepareRace(true);
    $("mission-title").textContent="SKILL COURSE";
    $("mission-sub").textContent="Pass each checkpoint and avoid the cones";
    toast("SKILL COURSE — FOLLOW THE MARKERS");
  } else {
    activitySystem.clearRaceGates();world.raceActive=false;
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
  player.rotation.set(0,-world.safeYaw,0);
  toast("VEHICLE RECOVERED");
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

function tick() {
  requestAnimationFrame(tick);
  const dt=Math.min(clock.getDelta(),.04);
  world.frameCount++;
  world.lastFrameDt=dt;
  if(world.started && !world.paused) {
    activitySystem.animateCollectibles(dt);
    drivingSystem.updatePhysics(dt);
    trafficSystem.updateTraffic(dt);
    cameraSystem.updateCamera(dt);
    minimapAccumulator+=dt;
    if(minimapAccumulator>=.1){cameraSystem.drawMiniMap();minimapAccumulator=0;}
  } else if(!world.started && player) {
    previewTime+=dt*.18;
    camera.position.set(Math.sin(previewTime)*13,6.4,Math.cos(previewTime)*15);
    camera.lookAt(0,0,0);
    const wheels=vehicleSystem.getWheels();
    if(wheels.length)wheels.forEach(w=>{if(w.mesh)w.mesh.rotation.x+=dt*.08;});
  }
  audioAccumulator+=dt;
  if(audioAccumulator>=.08){updateAudio();audioAccumulator=0;}
  if(!isSmokeMode) {
    if(composer)composer.render();
    else renderer.render(scene,camera);
  }
}
function onResize() {
  if(!renderer)return;
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  const quality=getQualityPreset(selectedQuality);
  renderer.setPixelRatio(isTestMode?0.5:Math.min(window.devicePixelRatio||1,quality.pixelRatio));
  renderer.setSize(isTestMode?320:window.innerWidth,isTestMode?200:window.innerHeight);
  if(composer)composer.setSize(window.innerWidth,window.innerHeight);
}

async function init() {
  try {
    setLoading(5,"SETTING UP RENDERER…");
    makeSky();
    buildRenderer();
    roadSystem=createRoadModule({scene,ROAD_SPACING,material,makeNoiseTexture,box});
    buildingSystem=createBuildingModule({scene,world,ROAD_SPACING,material,box,cylinder,rand});
    activitySystem=createActivityModule({scene,world,material,box,cylinder,signTexture:buildingSystem.signTexture,toast,getPlayer:()=>player});
    trafficSystem=createTrafficModule({scene,world,material,box,rand});
    vehicleSystem=createVehicleModule({scene,material,box,cylinder,cars,getCurrentCarIndex:()=>currentCarIndex,isSmokeMode:isTestMode,setLoading});
    controlSystem=createControlsModule({input,keys,world,recoverCar,toggleCamera,pauseGame});
    drivingSystem=createDrivingModule({world,cars,getCurrentCarIndex:()=>currentCarIndex,getPlayer:()=>player,vehicle:vehicleSystem,getReadInput:()=>controlSystem.readInput,toast,damp,clamp,collectStars:activitySystem.collectStars,$});
    cameraSystem=createCameraModule({world,getPlayer:()=>player,getCamera:()=>camera,ROAD_SPACING,clamp,damp,$});
    const pmremGenerator=new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    pmrem=pmremGenerator.fromScene(new RoomEnvironment(renderer),.04).texture;
    scene.environment=pmrem;
    scene.environmentIntensity=1.05;
    pmremGenerator.dispose();
    loadOutdoorCarEnvironment();

    setLoading(14,"LOADING DOWNTOWN CITY MAP…");
    await buildWorld();
    setLoading(48,"PREPARING DRIVING EXPERIENCE…");
    // Do not expose the procedural fallback while the detailed 3D car is loading.
    setLoading(58,"LOADING BUGATTI DIVO 3D MODEL…");
    const bugattiLoaded=await vehicleSystem.loadCarModel();
    if(!bugattiLoaded) {
      throw new Error("Bugatti Divo 3D model could not load. Check your connection and refresh the page.");
    }
    setLoading(78,"PREPARING BUGATTI DIVO…");
    updateGarage();
    replacePlayerVehicle();
    // Use the clear point calculated from Tokyo building bounds instead of
    // forcing the car into the map origin (which can sit inside a building).
    placeAtModeStart();
    controlSystem.bindControls();
    window.addEventListener("resize",onResize);
    const qualitySelect=$("quality-select");
    qualitySelect.value=selectedQuality;
    qualitySelect.addEventListener("change",()=>{
      selectedQuality=qualitySelect.value;
      applyQualitySettings();
      toast("GRAPHICS: "+getQualityPreset(selectedQuality).label.toUpperCase(),1.2);
    });
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
    showError(err?.message || "The 3D world could not start. Refresh the page or try a newer browser.");
    $("start-button").disabled=true;
    $("loadtext").textContent="INITIALISATION ERROR";
  }
}
init();