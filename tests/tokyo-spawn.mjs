import assert from "node:assert/strict";
import { findTokyoRoadSpawn } from "../src/world/tokyo-spawn.js";

const bounds = { minX: -120, maxX: 120, minZ: -120, maxZ: 120 };
const buildings = [
  { x: 60, z: 0, w: 14, d: 18 },
  { x: -12, z: 0, w: 10, d: 210 },
  { x: 12, z: 0, w: 10, d: 210 },
  { x: 0, z: -112, w: 38, d: 12 },
  { x: 0, z: 112, w: 38, d: 12 }
];

const fallback = findTokyoRoadSpawn(buildings, bounds, {
  maxRadius: 65, gridStep: 5, maxForwardDistance: 85,
  minForwardDistance: 55, vehicleClearance: 2.2
});
assert.ok(fallback, "a clear fallback spawn should be found");
assert.equal(fallback.roadVerified, false);
assert.ok(fallback.clearDistance >= 55);
assert.ok(!buildings.some(b =>
  Math.abs(fallback.x-b.x)<b.w*.5+2.2 && Math.abs(fallback.z-b.z)<b.d*.5+2.2
));

class Vec3 {
  constructor(x=0,y=0,z=0){this.set(x,y,z);}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  clone(){return new Vec3(this.x,this.y,this.z);}
  transformDirection(){return this;}
}
class Box3 {
  setFromObject(mesh){this.min=mesh.box.min;this.max=mesh.box.max;return this;}
  isEmpty(){return false;}
  getSize(target){return target.set(this.max.x-this.min.x,this.max.y-this.min.y,this.max.z-this.min.z);}
}
class Raycaster {
  set(origin,direction){this.origin=origin.clone();this.direction=direction.clone();}
  intersectObject(mesh){
    const b=mesh.box;
    if(this.origin.x<b.min.x||this.origin.x>b.max.x||this.origin.z<b.min.z||this.origin.z>b.max.z)return [];
    return [{point:new Vec3(this.origin.x,0,this.origin.z),face:{normal:new Vec3(0,1,0)}}];
  }
}
const THREE={Vector3:Vec3,Box3,Raycaster};
const roadMesh={
  isMesh:true,geometry:{},matrixWorld:{},updateWorldMatrix(){},
  box:{min:new Vec3(-10,0,-100),max:new Vec3(10,.15,100)}
};
const roadSpawn=findTokyoRoadSpawn([],bounds,{
  THREE,roadMeshes:[roadMesh],maxRadius:110,
  minForwardDistance:18,maxForwardDistance:64,vehicleClearance:2.6
});
assert.ok(roadSpawn,"a spawn should be found on the test road");
assert.equal(roadSpawn.roadVerified,true);
assert.ok(Math.abs(roadSpawn.x)<.01&&Math.abs(roadSpawn.z)<=5);
assert.ok(roadSpawn.clearDistance>=18);
console.log("PASS: Tokyo road spawn raycasts real road meshes and verifies the path ahead");
