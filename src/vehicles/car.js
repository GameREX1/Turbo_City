import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export function createVehicleModule({ scene, material, box, cylinder, cars }) {
  let vehicleWheels=[];
  let brakeLights=[];
  let playerLight=null;
  let bugattiDivoAsset=null;
  let spectralCarAsset=null;
  let detailedCarLoadAttempted=false;

  const profiles = {
    chiron:[[-.50,.64,.33,.72],[-.40,.82,.31,.86],[-.20,.96,.31,.98],[.16,1,.32,.96],[.40,.94,.34,.86],[.50,.80,.36,.72]],
    landcruiser:[[-.50,.82,.34,1.35],[-.40,.94,.33,1.43],[-.10,1,.33,1.43],[.28,1,.33,1.42],[.47,.96,.34,1.30],[.50,.88,.36,1.05]],
    svj:[[-.50,.62,.32,.72],[-.39,.83,.30,.86],[-.18,1,.31,.94],[.18,1,.31,.91],[.42,.94,.34,.84],[.50,.78,.36,.70]],
    supra:[[-.50,.68,.34,.73],[-.39,.84,.32,.90],[-.15,.97,.33,.98],[.19,.98,.33,.94],[.42,.91,.35,.83],[.50,.76,.37,.72]],
    gtr:[[-.50,.68,.33,.74],[-.40,.88,.32,.91],[-.18,1,.32,1.00],[.18,1,.33,.98],[.42,.95,.35,.86],[.50,.80,.37,.73]],
    mustang:[[-.50,.70,.34,.75],[-.39,.88,.32,.98],[-.16,1,.33,1.03],[.16,.99,.34,.97],[.42,.92,.36,.86],[.50,.78,.38,.74]],
    camaro:[[-.50,.72,.34,.74],[-.40,.89,.32,.96],[-.16,1,.33,1.02],[.18,1,.34,.99],[.42,.93,.36,.85],[.50,.79,.38,.73]]
  };

  function addQuad(parent,points,mat) {
    const geo=new THREE.BufferGeometry();
    geo.setAttribute("position",new THREE.Float32BufferAttribute(points.flat(),3));
    geo.setIndex([0,1,2,0,2,3]);
    geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,mat);
    mesh.material.side=THREE.DoubleSide;
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    parent.add(mesh);
    return mesh;
  }

  function makeHull(spec,paint) {
    const controlPoints=profiles[spec.kind]||profiles.chiron;
    const stations=[];
    // Interpolate profile stations so the body silhouette is smoothly rounded.
    const segments=4;
    for(let i=0;i<controlPoints.length-1;i++){
      const p0=controlPoints[Math.max(0,i-1)];
      const p1=controlPoints[i];
      const p2=controlPoints[i+1];
      const p3=controlPoints[Math.min(controlPoints.length-1,i+2)];
      for(let step=0;step<segments;step++){
        const t=step/segments,t2=t*t,t3=t2*t;
        const row=[];
        for(let axis=0;axis<4;axis++){
          const value=.5*((2*p1[axis])+(-p0[axis]+p2[axis])*t+
            (2*p0[axis]-5*p1[axis]+4*p2[axis]-p3[axis])*t2+
            (-p0[axis]+3*p1[axis]-3*p2[axis]+p3[axis])*t3);
          row.push(value);
        }
        stations.push(row);
      }
    }
    stations.push(controlPoints[controlPoints.length-1]);
    const verts=[],indices=[];
    const sides=48;
    stations.forEach(station=>{
      const z=station[0]*spec.length;
      const halfWidth=station[1]*spec.width*.5;
      const bottom=station[2],top=station[3];
      for(let i=0;i<sides;i++){
        const a=i/sides*Math.PI*2;
        const c=Math.cos(a),s=Math.sin(a);
        verts.push(c*halfWidth,bottom+(s*.5+.5)*(top-bottom),z);
      }
    });
    for(let j=0;j<stations.length-1;j++)for(let i=0;i<sides;i++){
      const a=j*sides+i,b=j*sides+(i+1)%sides,c=(j+1)*sides+i,d=(j+1)*sides+(i+1)%sides;
      indices.push(a,b,c,b,d,c);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute("position",new THREE.Float32BufferAttribute(verts,3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const body=new THREE.Mesh(geo,paint);
    body.castShadow=true;
    body.receiveShadow=true;
    return body;
  }

  function buildWheel(root,spec,side,z,front,tireMat,rimMat,brakeMat) {
    const radius=spec.wheelRadius;
    const pivot=new THREE.Group();
    pivot.position.set(side*(spec.width*.5+.035),radius,z);
    root.add(pivot);

    const tire=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,.34,32,1),tireMat);
    tire.rotation.z=Math.PI/2;
    tire.castShadow=true;
    tire.receiveShadow=true;
    pivot.add(tire);

    const rim=new THREE.Mesh(new THREE.CylinderGeometry(radius*.70,radius*.70,.365,32),rimMat);
    rim.rotation.z=Math.PI/2;
    rim.position.x=side*.012;
    pivot.add(rim);

    const sidewallRing=new THREE.Mesh(new THREE.TorusGeometry(radius*.86,.014,5,32),tireMat);
    sidewallRing.rotation.y=Math.PI/2;
    sidewallRing.position.x=side*.18;
    pivot.add(sidewallRing);

    const outerRing=new THREE.Mesh(new THREE.TorusGeometry(radius*.56,radius*.055,8,32),rimMat);
    outerRing.rotation.y=Math.PI/2;
    outerRing.position.x=side*.19;
    pivot.add(outerRing);

    const hub=new THREE.Mesh(new THREE.CylinderGeometry(radius*.17,radius*.17,.39,20),rimMat);
    hub.rotation.z=Math.PI/2;
    hub.position.x=side*.02;
    pivot.add(hub);

    for(let k=0;k<10;k++){
      const spoke=box(pivot,.045,.055,radius*1.03,rimMat,side*.205,0,0,false);
      spoke.rotation.x=k*Math.PI/5;
    }

    const disc=new THREE.Mesh(new THREE.CylinderGeometry(radius*.54,radius*.54,.025,28),material(0x68747d,.36,.82));
    disc.rotation.z=Math.PI/2;
    disc.position.x=side*.12;
    pivot.add(disc);
    const caliper=box(pivot,.095,radius*.42,.12,brakeMat,side*.16,radius*.10,radius*.42,false);
    caliper.rotation.x=.12;

    const lugMat=material(0xd5dbe0,.24,.9);
    for(let lug=0;lug<5;lug++){
      const angle=lug*Math.PI*2/5;
      const nut=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,.05,8),lugMat);
      nut.rotation.z=Math.PI/2;
      nut.position.set(side*.215,Math.cos(angle)*radius*.24,Math.sin(angle)*radius*.24);
      pivot.add(nut);
    }

    vehicleWheels.push({wheel:tire,pivot,front});
  }

  function buildDetailedCar(index, asset, rootName, orientation="auto") {
    const spec=cars[index];
    const root=new THREE.Group();
    root.name=rootName;
    const model=asset.clone(true);

    // Keep the model's own paint, glass and texture materials. Determine whether
    // its long axis is X or Z, then turn its nose toward the game's -Z direction.
    const sourceBounds=new THREE.Box3().setFromObject(model);
    const sourceSize=sourceBounds.getSize(new THREE.Vector3());
    if(orientation==="x-forward") {
      model.rotation.y=Math.PI/2;
    } else if(orientation==="z-forward") {
      model.rotation.y=Math.PI;
    } else {
      model.rotation.y=sourceSize.x>=sourceSize.z?Math.PI/2:Math.PI;
    }

    const bounds=new THREE.Box3().setFromObject(model);
    const size=bounds.getSize(new THREE.Vector3());
    const scale=Math.min(
      spec.length/Math.max(size.z,.001),
      spec.width/Math.max(size.x,.001),
      1.65/Math.max(size.y,.001)
    );
    model.scale.setScalar(scale);
    model.position.set(
      -(bounds.min.x+bounds.max.x)*.5*scale,
      -bounds.min.y*scale,
      -(bounds.min.z+bounds.max.z)*.5*scale
    );

    model.traverse(object=>{
      if(!object.isMesh)return;
      object.castShadow=true;
      object.receiveShadow=true;
      if(/tire|tyre|wheel/i.test(object.name)) {
        vehicleWheels.push({wheel:object,pivot:null,front:false,axis:"y"});
      }
    });
    root.add(model);
    scene.add(root);
    playerLight=null;
    return root;
  }

  function buildCar(index) {
    const spec=cars[index];
    const root=new THREE.Group();
    root.name="TurboCity_"+spec.kind;

    const paint=new THREE.MeshPhysicalMaterial({
      color:spec.color,metalness:.42,roughness:.245,clearcoat:.82,clearcoatRoughness:.11,envMapIntensity:1.35
    });
    const glass=new THREE.MeshPhysicalMaterial({
      color:0x263845,metalness:.22,roughness:.12,transparent:true,opacity:.56,clearcoat:.9,clearcoatRoughness:.08
    });
    const black=material(0x0b1119,.35,.52);
    const carbon=material(0x171e28,.28,.72);
    const chrome=material(0xb8c8d4,.2,.92);
    const rubber=material(0x090d12,.94,.04);
    const brake=material(spec.kind==="svj"?0xd1a44e:0xc34b3e,.38,.3);
    const headMat=new THREE.MeshStandardMaterial({color:0xf4fdff,emissive:0xd8ecff,emissiveIntensity:.85,roughness:.28});
    const tailMat=new THREE.MeshStandardMaterial({color:0xff3949,emissive:0x7d1020,emissiveIntensity:.55,roughness:.36});
    const accent=new THREE.MeshStandardMaterial({color:spec.color,metalness:.38,roughness:.3,emissive:spec.color,emissiveIntensity:.025});

    const L=spec.length,W=spec.width,front=-L*.5,rear=L*.5;
    const hw=W*.5,ride=spec.kind==="landcruiser"?.48:.36;
    const wheelFront=-spec.wheelbase*.5,wheelRear=spec.wheelbase*.5;

    // Low structural floor and shaped exterior shell.
    box(root,W*.91,.22,L*.82,black,0,ride*.82,0,false);
    root.add(makeHull(spec,paint));

    // Model-specific cabin proportions and glasshouse.
    const suv=spec.kind==="landcruiser";
    const cabW=spec.roofWidth;
    const base=spec.cabinBase,top=spec.cabinTop;
    const frontBase=suv?-L*.285:-L*.255;
    const frontTop=suv?-L*.205:-L*.145;
    const rearTop=suv?L*.205:L*.205;
    const rearBase=suv?L*.39:L*.36;
    const roofLength=suv?L*.43:L*.34;
    addQuad(root,[[-cabW*.91,base,frontBase],[cabW*.91,base,frontBase],[cabW*.78,top,frontTop],[-cabW*.78,top,frontTop]],glass);
    addQuad(root,[[-cabW*.78,top,rearTop],[cabW*.78,top,rearTop],[cabW*.91,base,rearBase],[-cabW*.91,base,rearBase]],glass);

    for(const side of [-1,1]){
      addQuad(root,[
        [side*cabW,base,frontBase],[side*cabW,base,rearBase],
        [side*cabW*.82,top,rearTop],[side*cabW*.82,top,frontTop]
      ],glass);
      // Window separators and substantial black side pillars.
      const pillarMat=black;
      box(root,.075,top-base,.075,pillarMat,side*cabW*.94,(top+base)*.5,frontBase*.36,false);
      box(root,.075,top-base,.075,pillarMat,side*cabW*.94,(top+base)*.5,rearBase*.53,false);
      box(root,.12,.12,.46,black,side*(hw+.10),base-.08,frontBase*.64,false);
      box(root,.19,.12,.26,paint,side*(hw+.10),base-.12,frontBase*.63,false);
      box(root,.13,.13,.25,carbon,side*(hw+.08),.58,-L*.13,false);
      box(root,.085,.075,.20,chrome,side*(hw+.11),.83,L*.025,false);
      box(root,.22,.13,.22,black,side*(hw+.13),.93,-L*.17,false);
      box(root,.17,.09,.045,chrome,side*(hw+.14),.94,-L*.17,false);
      // Door seams, handles and low side sills.
      box(root,.018,.34,L*.22,black,side*(hw*.985),.73,L*.085,false);
      box(root,.17,.035,.055,chrome,side*(hw+.012),.91,L*.05,false);
      box(root,.10,.12,L*.54,carbon,side*(hw*.94),.43,0,false);
    }

    // Visible cockpit: dashboard, two seats, headrests, center tunnel,
    // steering wheel, instrument display and seat belts behind the tinted glass.
    const cabinFloor=material(0x171b20,.96,.02);
    const leather=material(spec.kind==="landcruiser"?0x292521:0x17191d,.84,.03);
    const leatherTrim=material(0x3b3530,.78,.04);
    const dashMat=material(0x10161d,.72,.08);
    const displayMat=new THREE.MeshStandardMaterial({
      color:0x14252c,emissive:0x1e91a3,emissiveIntensity:.38,roughness:.35
    });
    box(root,cabW*1.7,.12,rearBase-frontBase-.16,cabinFloor,0,base-.16,(frontBase+rearBase)*.5,false);
    box(root,cabW*1.76,.22,.24,dashMat,0,base+.09,frontBase+.22,false);
    box(root,cabW*.72,.13,.34,leatherTrim,0,base+.01,frontBase+.49,false);
    box(root,.28,.18,.76,dashMat,0,base+.015,.28,false);
    box(root,.20,.045,.28,displayMat,0,base+.13,.03,false);
    box(root,.12,.11,.15,chrome,0,base+.10,.34,false);
    for(const side of [-1,1]){
      const seatX=side*cabW*.46;
      const seatZ=.38;
      box(root,.48,.17,.58,leather,seatX,base-.015,seatZ,false);
      const seatBack=box(root,.48,.69,.18,leather,seatX,base+.34,seatZ+.19,false);
      seatBack.rotation.x=.10;
      box(root,.32,.20,.18,leatherTrim,seatX,base+.78,seatZ+.25,false);
      // Seat-belt webbing and buckle.
      const belt=box(root,.045,.62,.035,leatherTrim,seatX+side*.17,base+.36,seatZ+.10,false);
      belt.rotation.z=side*.22;
      box(root,.075,.055,.055,chrome,seatX+side*.14,base+.10,seatZ-.08,false);
      // Door armrest and inner pull.
      box(root,.12,.11,.72,dashMat,side*cabW*.88,base-.02,.30,false);
      box(root,.08,.035,.18,chrome,side*cabW*.89,base+.06,.13,false);
    }
    const steeringWheel=new THREE.Mesh(new THREE.TorusGeometry(.225,.034,8,28),black);
    steeringWheel.rotation.y=Math.PI/2;
    steeringWheel.position.set(-cabW*.49,base+.06,frontBase+.54);
    root.add(steeringWheel);
    const steeringHub=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.09,16),chrome);
    steeringHub.rotation.z=Math.PI/2;
    steeringHub.position.copy(steeringWheel.position);
    root.add(steeringHub);
    const steeringColumn=new THREE.Mesh(new THREE.CylinderGeometry(.045,.055,.38,10),black);
    steeringColumn.rotation.x=Math.PI/2;
    steeringColumn.position.set(-cabW*.49,base-.015,frontBase+.36);
    root.add(steeringColumn);
    box(root,.38,.15,.06,displayMat,-cabW*.49,base+.25,frontBase+.30,false);
    // A small rear-view mirror and roof-mounted console complete the cabin.
    box(root,.22,.055,.07,black,0,top-.035,frontTop+.14,false);
    box(root,.12,.055,.05,chrome,0,top-.08,frontTop+.14,false);

    // Roof, windshield surround and subtle hood/roof contour lines.
    box(root,cabW*1.78,.09,roofLength,paint,0,top+.018,(frontTop+rearTop)*.5,false);
    box(root,cabW*1.92,.055,.08,black,0,top-.015,frontTop+.05,false);
    box(root,cabW*1.92,.055,.08,black,0,top-.015,rearTop-.05,false);
    if(suv){
      for(const side of [-1,1]){
        box(root,.075,.08,L*.42,chrome,side*cabW*.83,top+.10,0,false);
        box(root,.07,.09,.22,black,side*cabW*.83,top+.045,-L*.19,false);
        box(root,.07,.09,.22,black,side*cabW*.83,top+.045,L*.19,false);
      }
    } else {
      for(const side of [-1,1]){
        box(root,.035,.025,L*.25,accent,side*hw*.45,spec.bodyTop+.012,-L*.30,false);
      }
    }

    // Front bumper, lower splitter and grille.
    const grilleY=suv?.92:.68;
    const grilleW=suv?W*.62:W*.54;
    const grilleH=suv?.40:.26;
    box(root,W*.94,.16,.16,carbon,0,.48,front-.04,false);
    box(root,grilleW,grilleH,.055,black,0,grilleY,front-.045,false);
    box(root,W*.78,.055,.28,carbon,0,.37,front-.08,false);
    box(root,W*.82,.055,.22,chrome,0,.52,front-.09,false);

    if(suv){
      // Tall luxury 4x4 front signature: broad grille with chrome crossbars.
      for(let k=-2;k<=2;k++){
        box(root,grilleW*.95,.035,.035,chrome,0,grilleY+k*.072,front-.083,false);
      }
      for(const side of [-1,1]){
        box(root,.39,.19,.065,headMat,side*W*.36,1.12,front-.05,false);
        box(root,.17,.09,.055,black,side*W*.37,.77,front-.06,false);
        box(root,.18,.12,.10,carbon,side*W*.39,.55,front-.09,false);
        for(let k=0;k<3;k++)box(root,.035,.025,.025,headMat,side*W*.36+(k-1)*.09,1.12,front-.095,false);
      }
    } else if(spec.kind==="chiron"){
      // Signature horseshoe grille and four-part LED headlamp clusters.
      const horseshoe=new THREE.Mesh(new THREE.TorusGeometry(.37,.075,10,32),carbon);
      horseshoe.scale.set(.78,1.22,1);
      horseshoe.position.set(0,.68,front-.08);
      root.add(horseshoe);
      box(root,.42,.40,.055,black,0,.69,front-.06,false);
      for(const side of [-1,1]){
        box(root,.49,.12,.055,headMat,side*W*.35,1.00,front-.04,false);
        for(let k=0;k<4;k++)box(root,.035,.065,.03,chrome,side*W*.35+(k-1.5)*.105,1.0,front-.075,false);
        box(root,.23,.10,.045,black,side*W*.34,.52,front-.07,false);
      }
    } else if(spec.kind==="svj"){
      // Sharp Y-like light bars, angular intakes and a deep splitter.
      for(const side of [-1,1]){
        box(root,.43,.10,.045,headMat,side*W*.36,.95,front-.05,false);
        box(root,.28,.25,.055,black,side*W*.36,.64,front-.07,false);
        box(root,.38,.055,.05,accent,side*W*.36,.50,front-.11,false);
      }
      box(root,W*.96,.065,.42,carbon,0,.32,front-.14,false);
    } else if(spec.kind==="supra"){
      for(const side of [-1,1]){
        box(root,.46,.16,.055,headMat,side*W*.33,.91,front-.06,false);
        box(root,.24,.10,.045,black,side*W*.34,.62,front-.07,false);
        box(root,.18,.06,.04,chrome,side*W*.34,.78,front-.09,false);
      }
      box(root,W*.62,.18,.06,black,0,.62,front-.08,false);
    } else if(spec.kind==="gtr"){
      box(root,W*.68,.30,.06,black,0,.73,front-.07,false);
      for(const side of [-1,1]){
        box(root,.47,.12,.05,headMat,side*W*.34,.99,front-.06,false);
        box(root,.22,.16,.055,carbon,side*W*.38,.59,front-.07,false);
        box(root,.12,.07,.045,chrome,side*W*.36,.56,front-.10,false);
      }
    } else if(spec.kind==="mustang"){
      box(root,W*.63,.28,.06,black,0,.74,front-.07,false);
      for(const side of [-1,1]){
        box(root,.38,.13,.05,headMat,side*W*.36,.98,front-.06,false);
        for(let k=0;k<3;k++)box(root,.035,.10,.025,chrome,side*W*.36+(k-1)*.10,.98,front-.095,false);
      }
      box(root,W*.9,.08,.08,carbon,0,.48,front-.1,false);
    } else {
      box(root,W*.72,.22,.06,black,0,.74,front-.07,false);
      for(const side of [-1,1]){
        box(root,.43,.11,.05,headMat,side*W*.35,.98,front-.06,false);
        box(root,.22,.10,.04,black,side*W*.36,.61,front-.07,false);
      }
    }

    // Rear diffuser and model-specific lighting.
    box(root,W*.82,.12,.28,carbon,0,.42,rear+.035,false);
    box(root,W*.92,.12,.14,black,0,.50,rear+.04,false);
    if(spec.kind==="gtr"||spec.kind==="supra"){
      for(const side of [-1,1])for(let k=0;k<2;k++){
        const lamp=new THREE.Mesh(new THREE.TorusGeometry(.105,.038,8,20),tailMat);
        lamp.position.set(side*(spec.kind==="gtr"?.52:.62),.88,rear+.07+k*.01);
        root.add(lamp);
        brakeLights.push(lamp);
      }
    } else {
      for(const side of [-1,1]){
        const tail=new THREE.Mesh(new THREE.BoxGeometry(spec.kind==="landcruiser"?.18:.40,.13,.07),tailMat.clone());
        tail.position.set(side*(suv?W*.40:W*.35),suv?1.16:.82,rear+.055);
        root.add(tail);
        brakeLights.push(tail);
      }
    }
    for(const side of [-1,1]){
      const exhaust=new THREE.Mesh(new THREE.CylinderGeometry(.09,.10,.24,16),chrome);
      exhaust.rotation.x=Math.PI/2;
      exhaust.position.set(side*(suv?.62:.52),.43,rear+.10);
      root.add(exhaust);
    }

    // SUV spare wheel, sports-car spoilers and model-specific aero pieces.
    if(suv){
      const spare=new THREE.Mesh(new THREE.CylinderGeometry(.38,.38,.22,32),rubber);
      spare.rotation.x=Math.PI/2;
      spare.position.set(0,1.03,rear+.19);
      root.add(spare);
      const spareHub=new THREE.Mesh(new THREE.CylinderGeometry(.19,.19,.24,24),chrome);
      spareHub.rotation.x=Math.PI/2;
      spareHub.position.set(0,1.03,rear+.20);
      root.add(spareHub);
      box(root,W*.84,.10,.12,black,0,spec.cabinTop+.26,0,false);
    } else if(spec.kind==="svj"){
      box(root,W*.91,.09,.48,carbon,0,1.32,rear-.08,false);
      for(const side of [-1,1])box(root,.085,.48,.11,carbon,side*.72,1.10,rear-.12,false);
      box(root,W*.93,.085,.28,accent,0,1.55,rear-.08,false);
      for(const side of [-1,1])box(root,.32,.09,.38,accent,side*.82,.54,front+.34,false);
    } else if(spec.kind==="chiron"){
      box(root,W*.72,.075,.18,carbon,0,.94,rear-.10,false);
      box(root,W*.78,.08,.16,accent,0,.99,rear-.08,false);
    } else if(spec.kind==="supra"){
      box(root,W*.72,.09,.20,carbon,0,1.22,rear-.16,false);
      for(const side of [-1,1])box(root,.07,.32,.10,carbon,side*.62,1.06,rear-.16,false);
      box(root,W*.74,.075,.22,accent,0,1.24,rear-.16,false);
    } else if(spec.kind==="gtr"){
      box(root,W*.78,.08,.22,carbon,0,1.28,rear-.12,false);
      for(const side of [-1,1])box(root,.07,.38,.10,carbon,side*.66,1.10,rear-.14,false);
    } else if(spec.kind==="mustang"||spec.kind==="camaro"){
      box(root,W*.74,.07,.17,carbon,0,1.12,rear-.14,false);
    }

    // Four independently steerable, spinning wheels with detailed alloy rims.
    buildWheel(root,spec,-1,wheelFront,true,rubber,chrome,brake);
    buildWheel(root,spec,1,wheelFront,true,rubber,chrome,brake);
    buildWheel(root,spec,-1,wheelRear,false,rubber,chrome,brake);
    buildWheel(root,spec,1,wheelRear,false,rubber,chrome,brake);

    // Soft contact shadow improves grounding without expensive real-time shadow maps.
    const shadowCanvas=document.createElement("canvas");
    shadowCanvas.width=128;shadowCanvas.height=256;
    const ctx=shadowCanvas.getContext("2d");
    const gradient=ctx.createRadialGradient(64,128,12,64,128,124);
    gradient.addColorStop(0,"rgba(0,0,0,.52)");
    gradient.addColorStop(.48,"rgba(0,0,0,.24)");
    gradient.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=gradient;ctx.fillRect(0,0,128,256);
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(W*1.8,L*1.22),new THREE.MeshBasicMaterial({
      map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false,toneMapped:false
    }));
    shadow.rotation.x=-Math.PI/2;
    shadow.position.y=.014;
    shadow.renderOrder=2;
    root.add(shadow);

    playerLight=new THREE.PointLight(spec.color,.9,6);
    playerLight.position.set(0,.42,0);
    root.add(playerLight);
    root.traverse(obj=>{if(obj.isMesh)obj.frustumCulled=true;});
    scene.add(root);
    return root;
  }

  async function loadCarModel() {
    if(detailedCarLoadAttempted)return Boolean(bugattiDivoAsset||spectralCarAsset);
    detailedCarLoadAttempted=true;
    const loader=new GLTFLoader();

    const loadAsset=async(url,label)=>{
      try {
        const gltf=await loader.loadAsync(url);
        return gltf.scene;
      } catch(error) {
        console.warn(label+" could not load; the built-in vehicle will be used.",error);
        return null;
      }
    };

    // The uploaded Bugatti Divo is served from this repository. Keep the
    // original optional showcase car available as the final garage selection.
    const [divo,spectral]=await Promise.all([
      loadAsset("./bugati_divo.glb","Uploaded Bugatti Divo"),
      loadAsset("https://raw.githubusercontent.com/JaronKBragg7337/spectral-gt-rs/main/spectral_gt_rs_game_ready.glb","Spectral GT RS")
    ]);
    bugattiDivoAsset=divo;
    spectralCarAsset=spectral;
    return Boolean(bugattiDivoAsset||spectralCarAsset);
  }

  function makePlayerVehicle(index) {
    vehicleWheels=[];
    brakeLights=[];
    if(index===0&&bugattiDivoAsset) {
      return buildDetailedCar(index,bugattiDivoAsset,"TurboCity_Bugatti_Divo","auto");
    }
    if(index===cars.length-1&&spectralCarAsset) {
      return buildDetailedCar(index,spectralCarAsset,"TurboCity_Spectral_GT_RS","x-forward");
    }
    return buildCar(index);
  }

  function hasDetailedAsset(index) {
    return (index===0&&Boolean(bugattiDivoAsset))||
      (index===cars.length-1&&Boolean(spectralCarAsset));
  }

  return {
    loadCarModel,
    makePlayerVehicle,
    getWheels:()=>vehicleWheels,
    getBrakeLights:()=>brakeLights,
    getPlayerLight:()=>playerLight,
    hasDetailedAsset
  };
}
