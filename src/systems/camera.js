import * as THREE from "three";

export function createCameraModule({ world, getPlayer, getCamera, ROAD_SPACING, clamp, damp, $ }) {
  const orbit = { yaw: 0, pitch: 0.04 };
  let dragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  // Gearshift-style chase camera: keep the car low and centered, with mouse-drag orbit.
  function bindMouseOrbit() {
    const viewport = $("game");
    if (!viewport) return;

    viewport.addEventListener("pointerdown", (event) => {
      if (!world.started || world.paused || event.pointerType !== "mouse" || event.button !== 0) return;
      dragging = true;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      if (viewport.setPointerCapture) {
        try { viewport.setPointerCapture(event.pointerId); } catch (_) {}
      }
    });

    viewport.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const dx = event.clientX - lastPointerX;
      const dy = event.clientY - lastPointerY;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      orbit.yaw = clamp(orbit.yaw - dx * 0.0042, -1.55, 1.55);
      orbit.pitch = clamp(orbit.pitch + dy * 0.0028, -0.18, 0.52);
    });

    const stopDragging = () => { dragging = false; };
    viewport.addEventListener("pointerup", stopDragging);
    viewport.addEventListener("pointercancel", stopDragging);
    window.addEventListener("blur", stopDragging);
  }

  function updateCamera(dt) {
    const player = getPlayer();
    const camera = getCamera();
    if (!player) return;

    const speedFactor = clamp(Math.abs(world.speed) / 82, 0, 1);
    const vehicleForward = new THREE.Vector3(Math.sin(world.yaw), 0, -Math.cos(world.yaw));
    let desired;
    let target;

    if (world.cameraMode === 2) {
      // Hood view remains fixed to the car so mouse orbit cannot pull it outside.
      desired = player.position.clone().addScaledVector(vehicleForward, -1.15);
      desired.y += 1.52;
      target = player.position.clone().addScaledVector(vehicleForward, 24);
      target.y += 1.38;
    } else {
      const distance = world.cameraMode === 1 ? 11.2 : 6.5;
      const baseHeight = world.cameraMode === 1 ? 4.15 : 2.45;
      const orbitForward = new THREE.Vector3(
        Math.sin(world.yaw + orbit.yaw),
        0,
        -Math.cos(world.yaw + orbit.yaw)
      );

      desired = player.position.clone().addScaledVector(orbitForward, -distance);
      desired.y += baseHeight + speedFactor * 0.45 + orbit.pitch * distance;
      target = player.position.clone().addScaledVector(vehicleForward, world.cameraMode === 1 ? 5.3 : 3.2);
      target.y += world.cameraMode === 1 ? 1.05 : 0.96;
    }

    // Gentle speed-dependent follow keeps the car framed during fast turns.
    const followRate = 6.2 + speedFactor * 5.4;
    const follow = 1 - Math.exp(-followRate * dt);
    camera.position.lerp(desired, follow);
    camera.lookAt(target);
    camera.fov = damp(camera.fov, 60 + speedFactor * 6, 3.2, dt);
    camera.updateProjectionMatrix();
  }

  function drawMiniMap() {
    const player = getPlayer();
    const canvas = $("minimap"), ctx = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
    const extent = Number.isFinite(world.cityLimit) ? world.cityLimit : 600;
    const spacing = Number.isFinite(world.cityTileSpacing) ? world.cityTileSpacing : ROAD_SPACING;
    const mapX = (value) => (value + extent) / (extent * 2) * w;
    const mapZ = (value) => (value + extent) / (extent * 2) * h;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#101d28";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#4b5963";
    ctx.lineWidth = world.downtownCity ? 4 : 7;
    const gridRadius = Math.ceil(extent / spacing);
    for (let p = -gridRadius; p <= gridRadius; p++) {
      const x = mapX(p * spacing);
      const z = mapZ(p * spacing);
      if (x >= 0 && x <= w) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      if (z >= 0 && z <= h) {
        ctx.beginPath(); ctx.moveTo(0, z); ctx.lineTo(w, z); ctx.stroke();
      }
    }

    if (!world.downtownCity) {
      ctx.fillStyle = "#68835e";
      ctx.fillRect(mapX(340), mapZ(-470), mapX(460) - mapX(340), mapZ(-350) - mapZ(-470));
    }

    for (const star of world.stars) if (star.active) {
      const x = mapX(star.group.position.x), y = mapZ(star.group.position.z);
      ctx.fillStyle = "#ffc654";
      ctx.beginPath(); ctx.arc(x, y, 2.7, 0, Math.PI * 2); ctx.fill();
    }

    if (world.raceActive && world.gates[world.raceIndex]) {
      const gate = world.gates[world.raceIndex].position;
      const gx = mapX(gate.x), gy = mapZ(gate.z);
      const px = player ? mapX(player.position.x) : 0;
      const py = player ? mapZ(player.position.z) : 0;
      ctx.save();
      ctx.setLineDash([5, 5]); ctx.strokeStyle = "#30ddf5"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(gx, gy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#ffbd49"; ctx.strokeStyle = "#1b1c20"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(gx, gy, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    if (player) {
      const x = mapX(player.position.x), y = mapZ(player.position.z);
      ctx.save(); ctx.translate(x, y); ctx.rotate(-world.yaw);
      ctx.fillStyle = "#4ce6fa"; ctx.strokeStyle = "#07131c"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 8); ctx.lineTo(0, 5); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  bindMouseOrbit();
  return { updateCamera, drawMiniMap };
}
