import * as THREE from "three";

export function createActivityModule({ scene, world, material, box, cylinder, signTexture, toast, getPlayer }) {
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
    // Emissive materials provide the pickup highlight without a per-star real-time light.
    group.position.set(x,y,z);group.userData.baseY=y;group.userData.id=index;
    scene.add(group);world.stars.push({group,active:true});
  }
  function buildCollectibles() {
    const points = world.downtownCity
      ? [
          [-180,2.2,-205],[-90,2.2,-205],[0,2.2,-205],[90,2.2,-205],[180,2.2,-205],
          [-180,2.2,-155],[-90,2.2,-155],[0,2.2,-155],[90,2.2,-155],[180,2.2,-155],
          [-205,2.2,-90],[-155,2.2,-90],[-205,2.2,0],[-155,2.2,0],
          [155,2.2,0],[205,2.2,0],[155,2.2,90],[205,2.2,90],
          [-180,2.2,155],[-90,2.2,155],[0,2.2,155],[90,2.2,155],[180,2.2,155],
          [-180,2.2,205],[-90,2.2,205],[0,2.2,205],[90,2.2,205],[180,2.2,205]
        ]
      : [
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
    const player=getPlayer();
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
    world.route = skillCourse
      ? [
          new THREE.Vector3(400,0,-378),
          new THREE.Vector3(388,0,-412),
          new THREE.Vector3(412,0,-446),
          new THREE.Vector3(400,0,-480)
        ]
      : world.downtownCity
        ? [
            new THREE.Vector3(-90,0,-90),
            new THREE.Vector3(0,0,-90),
            new THREE.Vector3(90,0,-90),
            new THREE.Vector3(90,0,0),
            new THREE.Vector3(90,0,90),
            new THREE.Vector3(0,0,90),
            new THREE.Vector3(-90,0,90),
            new THREE.Vector3(-90,0,0)
          ]
        : [
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
  
  return { buildSkillDistrict, buildCollectibles, animateCollectibles, collectStars, createGate, clearRaceGates, prepareRace };
}
