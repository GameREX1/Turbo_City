const ROAD_PATTERN = /road|street|asphalt|carriage|pavement|道路|車道|舗装/i;
const BUILDING_PATTERN = /building|house|tower|structure|facade|建物|ビル|外壁/i;
const MARKING_PATTERN = /marking|lane|stripe|crosswalk|zebra|白線|車線/i;

export function enhanceTokyoCity(root, scene, THREE, renderer) {
  const styledMaterials = new Map();
  const roadDashes = [];
  const roadSamples = [];
  let roadMeshCount = 0;
  let buildingMeshCount = 0;
  let shadowMeshCount = 0;
  const maxShadowMeshes = 360;
  const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() || 4;

  function styleMaterial(original, kind) {
    if (!original || !original.isMaterial) return original;
    const key = original.uuid + ":" + kind;
    if (styledMaterials.has(key)) return styledMaterials.get(key);

    const next = original.clone();
    if (kind === "road") {
      next.roughness = Math.max(Number.isFinite(next.roughness) ? next.roughness : 0.8, 0.92);
      next.metalness = Math.min(Number.isFinite(next.metalness) ? next.metalness : 0, 0.08);
      next.envMapIntensity = 0.62;
      if (!next.map && next.color) next.color.multiplyScalar(0.86);
    } else {
      next.roughness = Math.max(Number.isFinite(next.roughness) ? next.roughness : 0.65, 0.68);
      next.metalness = Math.min(Number.isFinite(next.metalness) ? next.metalness : 0.12, 0.2);
      next.envMapIntensity = 0.78;
    }

    for (const mapName of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap"]) {
      const texture = next[mapName];
      if (texture) texture.anisotropy = Math.min(maxAnisotropy, 8);
    }

    next.needsUpdate = true;
    styledMaterials.set(key, next);
    return next;
  }

  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;

    const materials = Array.isArray(object.material)
      ? object.material
      : object.material ? [object.material] : [];
    const materialNames = materials.map((entry) => entry?.name || "").join(" ");
    const identity = (object.name || "") + " " + materialNames;
    const isRoad = ROAD_PATTERN.test(identity);
    const isMarkedSurface = MARKING_PATTERN.test(identity);
    const bounds = new THREE.Box3().setFromObject(object);
    if (bounds.isEmpty()) return;

    const size = bounds.getSize(new THREE.Vector3());
    const isBuilding = size.y > 7 && size.x > 3 && size.z > 3 &&
      size.x < 110 && size.z < 110 && size.y < 450;

    object.receiveShadow = true;
    object.castShadow = isBuilding && shadowMeshCount < maxShadowMeshes;
    if (object.castShadow) shadowMeshCount++;

    if (isRoad) {
      roadMeshCount++;
      if (roadSamples.length < 12) roadSamples.push(identity.slice(0, 100));
      object.material = Array.isArray(object.material)
        ? object.material.map((entry) => styleMaterial(entry, "road"))
        : styleMaterial(object.material, "road");

      // Add restrained Japanese-style broken white lane separators only to
      // long, flat, explicitly named road surfaces without existing markings.
      const width = Math.min(size.x, size.z);
      const length = Math.max(size.x, size.z);
      if (!isMarkedSurface && size.y < 2.5 && width >= 7 && width <= 28 &&
          length >= 32 && length <= 150) {
        const center = bounds.getCenter(new THREE.Vector3());
        // The lane-marking InstancedMesh is attached to the scene, so keep
        // these coordinates in world space after the city root is recentered.
        const alongX = size.x >= size.z;
        const halfLength = length * 0.5;
        for (let offset = -halfLength + 7; offset < halfLength - 3; offset += 11) {
          roadDashes.push({
            x: center.x + (alongX ? offset : 0),
            y: bounds.max.y + 0.035,
            z: center.z + (alongX ? 0 : offset),
            sx: alongX ? 2.2 : 0.12,
            sy: 0.025,
            sz: alongX ? 0.12 : 2.2
          });
        }
      }
    } else if (isBuilding) {
      buildingMeshCount++;
      if (object.material) {
        object.material = Array.isArray(object.material)
          ? object.material.map((entry) => styleMaterial(entry, "building"))
          : styleMaterial(object.material, "building");
      }
    }
  });

  if (roadDashes.length) {
    const marks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0xe5e4d9,
        roughness: 0.88,
        metalness: 0
      }),
      roadDashes.length
    );
    const transform = new THREE.Object3D();
    roadDashes.forEach((mark, index) => {
      transform.position.set(mark.x, mark.y, mark.z);
      transform.scale.set(mark.sx, mark.sy, mark.sz);
      transform.updateMatrix();
      marks.setMatrixAt(index, transform.matrix);
    });
    marks.instanceMatrix.needsUpdate = true;
    marks.castShadow = false;
    marks.receiveShadow = false;
    scene.add(marks);
  }

  return { roadMeshCount, buildingMeshCount, shadowMeshCount, laneMarkCount: roadDashes.length, roadSamples };
}
