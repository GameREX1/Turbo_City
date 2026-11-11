import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const ASSET_ROOT = new URL("../../assets/downtown/", import.meta.url);
const TILE_SIZE = 90;
const TILE_RADIUS = 2;
const CITY_LIMIT = 232;

function getTilePlacement(instance, tileX, tileZ) {
  // The modular block is rotationally symmetric at its road grid, so quarter
  // turns create visual variety while keeping every neighbouring block aligned.
  const quarter = ((tileX * 3 + tileZ * 5 + tileX * tileZ) % 4 + 4) % 4;
  const angle = quarter * Math.PI * 0.5;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: c * instance.x + s * instance.z + tileX * TILE_SIZE,
    y: instance.y,
    z: -s * instance.x + c * instance.z + tileZ * TILE_SIZE,
    yaw: instance.yaw + angle
  };
}

function makePlacementMatrix(placement) {
  const position = new THREE.Vector3(placement.x, placement.y, placement.z);
  const rotation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    placement.yaw
  );
  return new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(1, 1, 1));
}

function getAssetPlacements(layout) {
  const grouped = new Map();
  for (let tileX = -TILE_RADIUS; tileX <= TILE_RADIUS; tileX++) {
    for (let tileZ = -TILE_RADIUS; tileZ <= TILE_RADIUS; tileZ++) {
      for (const instance of layout.instances) {
        const placement = getTilePlacement(instance, tileX, tileZ);
        const matrix = makePlacementMatrix(placement);
        if (!grouped.has(instance.asset)) grouped.set(instance.asset, []);
        grouped.get(instance.asset).push({ instance, placement, matrix });
      }
    }
  }
  return grouped;
}

/**
 * Loads the Downtown City Kit as shared instanced geometry. The original
 * 118-object sample block is repeated as a 5x5 connected district (2,950
 * authored placements) without creating a separate draw call per object.
 */
export async function loadDowntownCity({ scene, world, setLoading = () => {} }) {
  const layoutResponse = await fetch(new URL("../../assets/downtown/layout.json", import.meta.url));
  if (!layoutResponse.ok) {
    throw new Error("Downtown layout could not be downloaded (" + layoutResponse.status + ").");
  }
  const layout = await layoutResponse.json();
  if (!Array.isArray(layout.instances) || layout.instances.length !== 118) {
    throw new Error("Downtown layout is incomplete: expected 118 original placements.");
  }

  const placementsByAsset = getAssetPlacements(layout);
  const assets = [...placementsByAsset.keys()].sort();
  const loader = new GLTFLoader();
  const cityRoot = new THREE.Group();
  cityRoot.name = "DowntownCityKit";
  const modelBounds = new Map();
  let sourceMeshCount = 0;
  let instancedMeshCount = 0;
  let buildingColliderCount = 0;

  world.buildings.length = 0;
  world.traffic.length = 0;

  for (let assetIndex = 0; assetIndex < assets.length; assetIndex++) {
    const assetPath = assets[assetIndex];
    setLoading(
      14 + Math.round((assetIndex / assets.length) * 29),
      "LOADING DOWNTOWN ASSETS " + (assetIndex + 1) + " / " + assets.length + "…"
    );

    const assetUrl = new URL(assetPath, ASSET_ROOT).href;
    const gltf = await loader.loadAsync(assetUrl);
    if (!gltf.scene) throw new Error("Downtown model has no scene: " + assetPath);

    const modelRoot = gltf.scene;
    modelRoot.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(modelRoot);
    if (bounds.isEmpty()) throw new Error("Downtown model has no geometry: " + assetPath);
    modelBounds.set(assetPath, bounds.clone());

    const meshRecords = [];
    modelRoot.traverse((object) => {
      if (!object.isMesh || !object.geometry || !object.material || object.visible === false) return;
      meshRecords.push({
        geometry: object.geometry,
        material: object.material,
        localMatrix: object.matrixWorld.clone(),
        name: object.name || assetPath
      });
    });
    if (!meshRecords.length) throw new Error("Downtown model contains no renderable meshes: " + assetPath);
    sourceMeshCount += meshRecords.length;

    const assetPlacements = placementsByAsset.get(assetPath);
    for (const record of meshRecords) {
      const instanced = new THREE.InstancedMesh(
        record.geometry,
        record.material,
        assetPlacements.length
      );
      instanced.name = "Downtown_" + record.name;
      instanced.castShadow = assetPath.includes("/buildings/") || assetPath.includes("/props/");
      instanced.receiveShadow = true;
      instanced.frustumCulled = true;
      instanced.instanceMatrix.setUsage(THREE.StaticDrawUsage);

      for (let index = 0; index < assetPlacements.length; index++) {
        const placementMatrix = assetPlacements[index].matrix.clone().multiply(record.localMatrix);
        instanced.setMatrixAt(index, placementMatrix);
      }
      instanced.instanceMatrix.needsUpdate = true;
      instanced.computeBoundingSphere();
      cityRoot.add(instanced);
      instancedMeshCount++;
    }

    if (assetPath.includes("/buildings/")) {
      const size = bounds.getSize(new THREE.Vector3());
      const localCenter = bounds.getCenter(new THREE.Vector3());
      for (const item of assetPlacements) {
        const center = localCenter.clone().applyMatrix4(item.matrix);
        const cos = Math.abs(Math.cos(item.placement.yaw));
        const sin = Math.abs(Math.sin(item.placement.yaw));
        world.buildings.push({
          x: center.x,
          z: center.z,
          w: cos * size.x + sin * size.z,
          d: sin * size.x + cos * size.z
        });
        buildingColliderCount++;
      }
    }
  }

  // A quiet base beneath the modular district closes small seams between tiles.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_LIMIT * 2, CITY_LIMIT * 2),
    new THREE.MeshStandardMaterial({ color: 0x536154, roughness: 1, metalness: 0 })
  );
  ground.name = "DowntownGround";
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.22;
  ground.receiveShadow = true;
  ground.castShadow = false;
  cityRoot.add(ground);

  scene.add(cityRoot);
  world.downtownCity = cityRoot;
  world.downtownSpawn.set(-28, 0, 0);
  world.downtownSpawnYaw = Math.PI / 2;
  world.cityLimit = CITY_LIMIT;
  world.cityTileSpacing = TILE_SIZE;
  world.driveSurfaceY = 0;

  setLoading(43, "DOWNTOWN CITY READY · PREPARING DRIVING WORLD…");
  const result = {
    originalPlacements: layout.instances.length,
    districtTiles: (TILE_RADIUS * 2 + 1) ** 2,
    totalPlacements: layout.instances.length * (TILE_RADIUS * 2 + 1) ** 2,
    modelCount: assets.length,
    sourceMeshCount,
    instancedMeshCount,
    buildingColliderCount,
    cityLimit: CITY_LIMIT
  };
  cityRoot.userData.downtownStats = result;
  console.info("Turbo City: Downtown City Kit loaded", result);
  return result;
}
