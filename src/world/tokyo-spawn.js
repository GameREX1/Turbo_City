const DIRECTIONS = [
  { x: 0, z: -1, yaw: 0, name: "north" },
  { x: 0, z: 1, yaw: Math.PI, name: "south" },
  { x: 1, z: 0, yaw: Math.PI / 2, name: "east" },
  { x: -1, z: 0, yaw: -Math.PI / 2, name: "west" }
];

function overlapsBuilding(x, z, building, clearance) {
  return Math.abs(x - building.x) < building.w * 0.5 + clearance &&
    Math.abs(z - building.z) < building.d * 0.5 + clearance;
}

function findOpenCorridorSpawn(buildings, bounds, options = {}) {
  const maxRadius = options.maxRadius ?? 230;
  const gridStep = options.gridStep ?? 10;
  const minForwardDistance = options.minForwardDistance ?? 24;
  const maxForwardDistance = options.maxForwardDistance ?? 70;
  const clearance = options.vehicleClearance ?? 2.6;
  const minX = bounds.minX + 12, maxX = bounds.maxX - 12;
  const minZ = bounds.minZ + 12, maxZ = bounds.maxZ - 12;
  const preferredX = options.preferredX ?? 0, preferredZ = options.preferredZ ?? 0;
  let best = null, bestScore = -Infinity;

  for (let x = Math.ceil((preferredX - maxRadius) / gridStep) * gridStep;
       x <= preferredX + maxRadius; x += gridStep) {
    for (let z = Math.ceil((preferredZ - maxRadius) / gridStep) * gridStep;
         z <= preferredZ + maxRadius; z += gridStep) {
      if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
      const distanceSquared = (x - preferredX) ** 2 + (z - preferredZ) ** 2;
      if (distanceSquared > maxRadius * maxRadius) continue;
      if (buildings.some((b) => overlapsBuilding(x, z, b, clearance))) continue;

      for (const direction of DIRECTIONS) {
        let clearDistance = Math.min(maxForwardDistance,
          direction.x > 0 ? maxX - x : direction.x < 0 ? x - minX :
          direction.z > 0 ? maxZ - z : z - minZ);
        for (const building of buildings) {
          const ox = building.x - x, oz = building.z - z;
          const along = ox * direction.x + oz * direction.z;
          const lateral = ox * -direction.z + oz * direction.x;
          const halfAlong = Math.abs(direction.x) * building.w * 0.5 +
            Math.abs(direction.z) * building.d * 0.5;
          const halfLateral = Math.abs(direction.z) * building.w * 0.5 +
            Math.abs(direction.x) * building.d * 0.5;
          if (Math.abs(lateral) > halfLateral + clearance) continue;
          const nearEdge = along - halfAlong - clearance;
          if (nearEdge > 0) clearDistance = Math.min(clearDistance, nearEdge);
        }
        if (clearDistance < minForwardDistance) continue;
        const score = clearDistance * 100 - Math.sqrt(distanceSquared) * 0.05;
        if (score > bestScore) {
          bestScore = score;
          best = { x, y: 0, z, yaw: direction.yaw, direction: direction.name,
            clearDistance: Number(clearDistance.toFixed(1)), roadVerified: false };
        }
      }
    }
  }
  return best;
}

/**
 * Select a spawn from the imported asphalt meshes themselves. Each candidate is
 * raycast against real road triangles; the route ahead is rechecked against road
 * triangles and building footprints before it is accepted.
 */
function findRoadSurfaceSpawn(buildings, bounds, options) {
  const THREE = options.THREE;
  const roadMeshes = options.roadMeshes || [];
  if (!THREE || !roadMeshes.length) return null;

  const records = [];
  for (const mesh of roadMeshes) {
    if (!mesh?.isMesh || !mesh.geometry) continue;
    mesh.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) continue;
    const size = box.getSize(new THREE.Vector3());
    if (size.y > 12 || size.x < 4 || size.z < 4) continue;
    records.push({ mesh, box });
  }
  if (!records.length) return null;

  const raycaster = new THREE.Raycaster();
  raycaster.far = 1400;
  const down = new THREE.Vector3(0, -1, 0);
  const origin = new THREE.Vector3();

  function surfaceAt(x, z) {
    let bestHit = null;
    for (const record of records) {
      const b = record.box;
      if (x < b.min.x - 0.3 || x > b.max.x + 0.3 ||
          z < b.min.z - 0.3 || z > b.max.z + 0.3) continue;
      origin.set(x, b.max.y + 8, z);
      raycaster.set(origin, down);
      const hits = raycaster.intersectObject(record.mesh, false);
      for (const hit of hits) {
        if (hit.face?.normal) {
          const normal = hit.face.normal.clone().transformDirection(record.mesh.matrixWorld);
          if (normal.y < 0.55) continue;
        }
        if (!bestHit || hit.point.y > bestHit.y) {
          bestHit = { x: hit.point.x, y: hit.point.y, z: hit.point.z };
        }
        break;
      }
    }
    return bestHit;
  }

  const candidates = [];
  const seen = new Set();
  const addCandidate = (x, z) => {
    if (x < bounds.minX + 10 || x > bounds.maxX - 10 ||
        z < bounds.minZ + 10 || z > bounds.maxZ - 10) return;
    const key = Math.round(x / 2.5) + ":" + Math.round(z / 2.5);
    if (seen.has(key)) return;
    seen.add(key);
    const hit = surfaceAt(x, z);
    if (hit) candidates.push(hit);
  };

  for (const record of records) {
    const b = record.box;
    const sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
    const width = Math.min(sx, sz), length = Math.max(sx, sz);
    if (width <= 55 && length >= 8 && length <= 240) {
      const alongX = sx >= sz;
      const minAlong = alongX ? b.min.x : b.min.z;
      const maxAlong = alongX ? b.max.x : b.max.z;
      const lateral = alongX ? (b.min.z + b.max.z) * 0.5 : (b.min.x + b.max.x) * 0.5;
      const step = Math.max(4, Math.min(9, width * 0.55));
      for (let a = minAlong + Math.min(3, length * 0.15); a <= maxAlong - 2; a += step) {
        addCandidate(alongX ? a : lateral, alongX ? lateral : a);
        if (candidates.length >= 4200) break;
      }
    } else {
      const area = Math.max(1, sx * sz);
      const step = Math.max(8, Math.min(18, Math.sqrt(area / 1800)));
      for (let x = b.min.x + step * 0.5; x <= b.max.x; x += step) {
        for (let z = b.min.z + step * 0.5; z <= b.max.z; z += step) {
          addCandidate(x, z);
          if (candidates.length >= 4200) break;
        }
        if (candidates.length >= 4200) break;
      }
    }
    if (candidates.length >= 4200) break;
  }

  const clearance = options.vehicleClearance ?? 2.6;
  const minForwardDistance = options.minForwardDistance ?? 18;
  const maxForwardDistance = options.maxForwardDistance ?? 64;
  const pathStep = 4;
  const maxRadius = options.maxRadius ?? 280;
  let best = null, bestScore = -Infinity;

  for (const candidate of candidates) {
    const fromCenter = Math.hypot(candidate.x, candidate.z);
    if (fromCenter > maxRadius) continue;
    if (buildings.some((b) => overlapsBuilding(candidate.x, candidate.z, b, clearance))) continue;

    for (const direction of DIRECTIONS) {
      const sideX = -direction.z * 1.45;
      const sideZ = direction.x * 1.45;
      if (!surfaceAt(candidate.x + sideX, candidate.z + sideZ) ||
          !surfaceAt(candidate.x - sideX, candidate.z - sideZ)) continue;

      let clearDistance = 0;
      for (let distance = pathStep; distance <= maxForwardDistance; distance += pathStep) {
        const x = candidate.x + direction.x * distance;
        const z = candidate.z + direction.z * distance;
        if (!surfaceAt(x, z)) break;
        if (buildings.some((b) => overlapsBuilding(x, z, b, clearance))) break;
        clearDistance = distance;
      }

      if (clearDistance < minForwardDistance) continue;
      const score = clearDistance * 100 - fromCenter * 0.04;
      if (score > bestScore) {
        bestScore = score;
        best = {
          x: candidate.x, y: candidate.y, z: candidate.z,
          yaw: direction.yaw, direction: direction.name,
          clearDistance, roadVerified: true
        };
      }
    }
  }
  return best;
}

export function findTokyoRoadSpawn(buildings, bounds, options = {}) {
  const roadSpawn = findRoadSurfaceSpawn(buildings, bounds, options);
  if (roadSpawn) return roadSpawn;

  // Used only when the city GLB contains no detectable road mesh. Building
  // colliders stay enabled even in fallback mode.
  return findOpenCorridorSpawn(buildings, bounds, options);
}
