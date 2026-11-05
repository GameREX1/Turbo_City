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
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#101d28";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#4b5963";
    ctx.lineWidth = 7;
    for (let p = -3; p <= 3; p++) {
      const q = (p * ROAD_SPACING + 600) / 1200 * w;
      ctx.beginPath(); ctx.moveTo(q, 0); ctx.lineTo(q, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, q); ctx.lineTo(w, q); ctx.stroke();
    }
    ctx.fillStyle = "#68835e";
    ctx.fillRect((340 + 600) / 1200 * w, (-470 + 600) / 1200 * h, (120 / 1200) * w, (120 / 1200) * h);
    for (const s of world.stars) if (s.active) {
      const x = (s.group.position.x + 600) / 1200 * w, y = (s.group.position.z + 600) / 1200 * h;
      ctx.fillStyle = "#ffc654"; ctx.beginPath(); ctx.arc(x, y, 2.7, 0, Math.PI * 2); ctx.fill();
    }
    if (world.raceActive && world.gates[world.raceIndex]) {
      const gate = world.gates[world.raceIndex].position;
      const gx = (gate.x + 600) / 1200 * w, gy = (gate.z + 600) / 1200 * h;
      const px = player ? (player.position.x + 600) / 1200 * w : 0;
      const py = player ? (player.position.z + 600) / 1200 * h : 0;
      ctx.save();
      ctx.setLineDash([5, 5]); ctx.strokeStyle = "#30ddf5"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(gx, gy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#ffbd49"; ctx.strokeStyle = "#1b1c20"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(gx, gy, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    if (player) {
      const x = (player.position.x + 600) / 1200 * w, y = (player.position.z + 600) / 1200 * h;
      ctx.save(); ctx.translate(x, y); ctx.rotate(-world.yaw);
      ctx.fillStyle = "#4ce6fa"; ctx.strokeStyle = "#07131c"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 8); ctx.lineTo(0, 5); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  bindMouseOrbit();
  return { updateCamera, drawMiniMap };
}
