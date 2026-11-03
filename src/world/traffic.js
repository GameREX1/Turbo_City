import * as THREE from "three";

export function createTrafficModule({ scene, world, material, rand }) {
  const colors=[0xe7e4d9,0x2c536f,0x9b3038,0x777f83,0xd2a34b,0x1d3433,0x526a86];
  const roadXs=[-320,-160,0,160,320];
  const trafficMeshes={bodies:[],glass:null,bumpers:null,headlights:null,taillights:null,tires:null,rims:null};
  const dummy=new THREE.Object3D();
  const matrixPosition=new THREE.Vector3();
  const matrixScale=new THREE.Vector3();
  const matrixRotation=new THREE.Euler();
  const bodyCounts=colors.map(()=>0);
  const records=[];
  let updateAccumulator=0;

  function makeInstanced(geometry,mat,count) {
    if(!count)return null;
    const mesh=new THREE.InstancedMesh(geometry,mat,count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow=false;
    mesh.receiveShadow=false;
    scene.add(mesh);
    return mesh;
  }

  function place(mesh,index,record,localX,localY,localZ,sx,sy,sz,spin=0) {
    if(!mesh)return;
    const yaw=record.yaw;
    const cos=Math.cos(yaw),sin=Math.sin(yaw);
    matrixPosition.set(
      record.x+cos*localX+sin*localZ,
      .02+localY,
      record.z-sin*localX+cos*localZ
    );
    matrixScale.set(sx,sy,sz);
    dummy.position.copy(matrixPosition);
    dummy.scale.copy(matrixScale);
    // Vehicle parts share the same heading; only the wheel mesh receives spin.
    dummy.rotation.order="YXZ";
    dummy.rotation.set(spin,yaw,0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index,dummy.matrix);
  }

  function refreshTrafficMatrices() {
    const bodySlots=bodyCounts.map(()=>0);
    records.forEach(record=>{
      const bodyMesh=trafficMeshes.bodies[record.colorIndex];
      place(bodyMesh,bodySlots[record.colorIndex]++,record,0,.72,0,1.92,.52,4.02);
      place(trafficMeshes.glass,record.id,record,0,1.2,-.02,1.62,.57,1.9);
      place(trafficMeshes.bumpers,record.id*2,record,0,.47,-2.03,1.82,.13,.34);
      place(trafficMeshes.bumpers,record.id*2+1,record,0,.47,2.03,1.82,.13,.34);
      for(const side of [-1,1]) {
        const lightIndex=record.id*2+(side===1?1:0);
        place(trafficMeshes.headlights,lightIndex,record,side*.62,.83,-2.045,.38,.12,.06);
        place(trafficMeshes.taillights,lightIndex,record,side*.62,.82,2.045,.42,.13,.06);
      }
      for(let wheel=0;wheel<4;wheel++) {
        const side=wheel<2?-1:1;
        const axle=wheel%2===0?-1:1;
        const wheelIndex=record.id*4+wheel;
        const spin=record.spin;
        place(trafficMeshes.tires,wheelIndex,record,side*.98,.39,axle*1.27,.24,.70,.70,spin);
        place(trafficMeshes.rims,wheelIndex,record,side*.98,.39,axle*1.27,.255,.36,.36,spin);
      }
    });
    for(const mesh of [...trafficMeshes.bodies,trafficMeshes.glass,trafficMeshes.bumpers,trafficMeshes.headlights,trafficMeshes.taillights,trafficMeshes.tires,trafficMeshes.rims]) {
      if(mesh)mesh.instanceMatrix.needsUpdate=true;
    }
  }

  function buildTraffic() {
    for(let i=0;i<16;i++) {
      const direction=i%2===0?1:-1;
      const roadX=roadXs[Math.floor(i/2)%roadXs.length];
      const laneX=roadX+(direction>0?-6.2:6.2);
      let z=rand(-490,490);
      if(Math.abs(laneX)<20&&Math.abs(z)<105)z=z<0?-165:165;
      const group=new THREE.Group();
      group.position.set(laneX,.02,z);
      const colorIndex=i%colors.length;
      const record={
        id:i,group,x:laneX,z,speed:rand(9,16),direction,
        yaw:direction>0?Math.PI:0,colorIndex,spin:0
      };
      bodyCounts[colorIndex]++;
      records.push(record);
      world.traffic.push(record);
    }

    const paintMaterials=colors.map(color=>new THREE.MeshStandardMaterial({
      color,metalness:.42,roughness:.34
    }));
    const glassMaterial=new THREE.MeshStandardMaterial({color:0x172b38,metalness:.2,roughness:.2});
    const darkMaterial=material(0x10171d,.55,.5);
    const headMaterial=new THREE.MeshStandardMaterial({color:0xf3fbff,emissive:0x8fcfff,emissiveIntensity:1.25});
    const tailMaterial=new THREE.MeshStandardMaterial({color:0xff3448,emissive:0xb40d20,emissiveIntensity:1.0});
    const tireMaterial=material(0x111519,.94);
    const rimMaterial=material(0xb9c3c9,.24,.92);
    trafficMeshes.bodies=paintMaterials.map((mat,index)=>makeInstanced(new THREE.BoxGeometry(1,1,1),mat,bodyCounts[index]));
    trafficMeshes.glass=makeInstanced(new THREE.BoxGeometry(1,1,1),glassMaterial,records.length);
    trafficMeshes.bumpers=makeInstanced(new THREE.BoxGeometry(1,1,1),darkMaterial,records.length*2);
    trafficMeshes.headlights=makeInstanced(new THREE.BoxGeometry(1,1,1),headMaterial,records.length*2);
    trafficMeshes.taillights=makeInstanced(new THREE.BoxGeometry(1,1,1),tailMaterial,records.length*2);
    trafficMeshes.tires=makeInstanced(new THREE.CylinderGeometry(.35,.35,.24,18),tireMaterial,records.length*4);
    trafficMeshes.rims=makeInstanced(new THREE.CylinderGeometry(.18,.18,.255,14),rimMaterial,records.length*4);
    refreshTrafficMatrices();
  }

  function updateTraffic(dt) {
    // Traffic is background scenery: update its instance matrices at 30 Hz,
    // not on every render frame.
    updateAccumulator+=Math.min(dt,.1);
    if(updateAccumulator<1/30)return;
    const step=updateAccumulator;
    updateAccumulator=0;
    for(const record of records) {
      record.z+=record.speed*record.direction*step;
      if(record.z>520)record.z=-520;
      if(record.z<-520)record.z=520;
      record.group.position.z=record.z;
      record.spin+=record.speed*record.direction*step/.35;
    }
    refreshTrafficMatrices();
  }

  return { buildTraffic, updateTraffic };
}
