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

/**
 * Selects a spawn point with a long, clear, vehicle-width corridor ahead.
 * Building footprints are conservative world-space AABBs extracted from the GLB.
 */
export function findTokyoRoadSpawn(buildings, bounds, options = {}) {
  const maxRadius = options.maxRadius ?? 230;
  const gridStep = options.gridStep ?? 10;
  const maxForwardDistance = options.maxForwardDistance ?? 90;
  const minForwardDistance = options.minForwardDistance ?? 36;
  const corridorHalfWidth = options.corridorHalfWidth ?? 4.6;
  const vehicleClearance = options.vehicleClearance ?? 2.6;
  const preferredX = options.preferredX ?? 0;
  const preferredZ = options.preferredZ ?? 0;

  const minX = bounds.minX + 12;
  const maxX = bounds.maxX - 12;
  const minZ = bounds.minZ + 12;
  const maxZ = bounds.maxZ - 12;
  const candidates = [];

  for (let x = Math.ceil((preferredX - maxRadius) / gridStep) * gridStep;
       x <= preferredX + maxRadius; x += gridStep) {
    for (let z = Math.ceil((preferredZ - maxRadius) / gridStep) * gridStep;
         z <= preferredZ + maxRadius; z += gridStep) {
      if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
      const dx = x - preferredX;
      const dz = z - preferredZ;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared <= maxRadius * maxRadius) {
        candidates.push({ x, z, distanceSquared });
      }
    }
  }

  // Evaluate nearby positions first so ties naturally favour the city centre.
  candidates.sort((a, b) => a.distanceSquared - b.distanceSquared);

  let best = null;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    let blockedAtSpawn = false;
    for (const building of buildings) {
      if (overlapsBuilding(candidate.x, candidate.z, building, vehicleClearance)) {
        blockedAtSpawn = true;
        break;
      }
    }
    if (blockedAtSpawn) continue;

    for (const direction of DIRECTIONS) {
      const boundaryDistance = direction.x > 0
        ? maxX - candidate.x
        : direction.x < 0
          ? candidate.x - minX
          : direction.z > 0
            ? maxZ - candidate.z
            : candidate.z - minZ;

      let clearDistance = Math.min(maxForwardDistance, boundaryDistance);
      let leftSideGap = Infinity;
      let rightSideGap = Infinity;

      for (const building of buildings) {
        const offsetX = building.x - candidate.x;
        const offsetZ = building.z - candidate.z;
        const along = offsetX * direction.x + offsetZ * direction.z;
        const lateral = offsetX * -direction.z + offsetZ * direction.x;
        const halfAlong = Math.abs(direction.x) * building.w * 0.5 +
          Math.abs(direction.z) * building.d * 0.5;
        const halfLateral = Math.abs(direction.z) * building.w * 0.5 +
          Math.abs(direction.x) * building.d * 0.5;
        const lateralGap = Math.abs(lateral) - halfLateral - vehicleClearance;

        // Nearby buildings on both sides help distinguish a street corridor
        // from a large open plaza, without requiring a particular GLB naming scheme.
        if (along + halfAlong >= -8 && along - halfAlong <= 44 &&
            lateralGap >= corridorHalfWidth && lateralGap <= 38) {
          if (lateral >= 0) leftSideGap = Math.min(leftSideGap, lateralGap);
          else rightSideGap = Math.min(rightSideGap, lateralGap);
        }

        if (Math.abs(lateral) > halfLateral + corridorHalfWidth + vehicleClearance) continue;
        const farEdge = along + halfAlong + vehicleClearance;
        if (farEdge <= 0) continue;

        const nearEdge = along - halfAlong - vehicleClearance;
        clearDistance = Math.min(clearDistance, Math.max(0, nearEdge));
        if (clearDistance < minForwardDistance) break;
      }

      if (clearDistance < minForwardDistance) continue;

      const hasStreetWalls = Number.isFinite(leftSideGap) && Number.isFinite(rightSideGap);
      const roadsideBonus = hasStreetWalls
        ? Math.max(0, 24 - Math.abs(leftSideGap - 8) - Math.abs(rightSideGap - 8))
        : 0;
      const centrePenalty = Math.sqrt(candidate.distanceSquared) * 0.05;
      const score = clearDistance * 100 + roadsideBonus * 12 - centrePenalty;

      if (score > bestScore) {
        bestScore = score;
        best = {
          x: candidate.x,
          z: candidate.z,
          yaw: direction.yaw,
          direction: direction.name,
          clearDistance: Number(clearDistance.toFixed(1)),
          roadside: hasStreetWalls
        };
      }
    }
  }

  return best;
}
