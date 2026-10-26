/** Geometry uses square physical units; terminal rows are twice as tall as columns. */
export type PondMode = "dark" | "light";
export type PondStyle = "ascii" | "blocks";
export type PondView = "home" | "session";
export type Pixel = { x: number; y: number; glyph: string; ink: number };
export const LOOP_SECONDS = 3600;
// Quantize well below frame resolution so t and t + period rasterize identically.
export function loopTime(seconds: number) {
  return (Math.round((((seconds % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS) * 1e6) / 1e6) % LOOP_SECONDS;
}
export const palettes = {
  dark: ["#aaa99d", "#cc7467", "#676b70", "#bf9b4f", "#65685e"],
  light: ["#777b76", "#b84e42", "#303638", "#a18435", "#a8aaa2"],
};

/** Only reserve terminal chrome. Host text and panels occlude fish at paint time. */
export function protectedCell(x: number, y: number, width: number, height: number, _view: PondView = "home") {
  return y < 3 || y >= height - 3 || x < 2 || x >= width - 2;
}

const fish = [
  { x: .12, y: .24, angle: 1.35, kind: 0, phase: 0 },
  { x: .77, y: .21, angle: .15, kind: 1, phase: 1.8 },
  { x: .91, y: .60, angle: 1.6, kind: 2, phase: 3.1 },
  { x: .15, y: .82, angle: .2, kind: 3, phase: 4.7 },
  { x: .71, y: .85, angle: -.3, kind: 4, phase: 2.5 },
];

type RouteTable={angles:Float64Array;lengths:Float64Array;total:number};
const routeCache=new Map<string,RouteTable>();

/** Equal distance along a crossing route: bends cannot make a fish stall. */
function routeAngle(width:number,height:number,fraction:number) {
  const key=`${width}:${height}`;
  let table=routeCache.get(key);
  if(!table){
    const count=2048,angles=new Float64Array(count+1),lengths=new Float64Array(count+1);
    const rx=width*.355,ry=Math.max(1,height/2-6)*1.6;
    let px=0,py=0;
    for(let i=0;i<=count;i++){
      const theta=i/count*Math.PI*2,x=rx*Math.sin(theta),y=ry*Math.sin(2*theta);
      angles[i]=theta;
      if(i>0) lengths[i]=lengths[i-1]+Math.hypot(x-px,y-py);
      px=x;py=y;
    }
    table={angles,lengths,total:lengths[count]};
    if(routeCache.size>=4) routeCache.delete(routeCache.keys().next().value!);
    routeCache.set(key,table);
  }
  const target=(((fraction%1)+1)%1)*table.total;
  let lo=0,hi=table.lengths.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>>1;if(table.lengths[mid]<target)lo=mid;else hi=mid;}
  const t=(target-table.lengths[lo])/(table.lengths[hi]-table.lengths[lo]);
  return table.angles[lo]+(table.angles[hi]-table.angles[lo])*t;
}

/** Space fish along the route, with slowly changing individual course offsets. */
export function fishPose(width: number, height: number, seconds: number, index: number, _view: PondView = "home") {
  const time = loopTime(seconds);
  const seed = fish[index].phase;
  const point = (t: number) => {
    const phase = loopTime(t) / LOOP_SECONDS * Math.PI * 2;
    const theta=routeAngle(width,height,28*loopTime(t)/LOOP_SECONDS+index/5+.08);
    const ry=Math.max(1,height/2-6);
    // All five are separated by travelled distance, rather than five oscillators
    // independently slowing down and gathering at their turning points.
    return {
      x: width/2 + width*.355*(Math.sin(theta)+.035*Math.sin(3*theta+3*phase+seed)+.015*Math.sin(5*theta-7*phase+seed*.7)),
      y: height/2 + ry*(.8*Math.sin(2*theta)+.05*Math.sin(3*theta-5*phase+seed*.4)+.025*Math.sin(theta+11*phase+seed)),
    };
  };
  const here = point(time), before = point(time - .02), after = point(time + .02);
  return {...here, angle: Math.atan2((after.y - before.y) * 2, after.x - before.x)};
}

export type SpinePoint = {x:number;y:number;u:number;angle:number};
const lengthScale = 1.22*1.30;
const fishSize = (width:number,height:number)=>Math.min(3,width/75,height/25);
const angleDifference = (a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
/** Facing is tied to forward travel, never animated independently of the head. */
export function fishHeading(width:number,height:number,seconds:number,index:number) {
  return fishPose(width,height,seconds,index).angle;
}

/** A head-led chain: each section follows an older heading, then relaxes straight. */
export function fishSpine(width:number,height:number,seconds:number,index:number,view:PondView="home"):SpinePoint[] {
  seconds=loopTime(seconds);
  const size=fishSize(width,height);
  const heading=(t:number)=>fishHeading(width,height,t,index);
  const head=fishPose(width,height,seconds,index,view);
  const before=fishPose(width,height,seconds-.5,index,view),after=fishPose(width,height,seconds+.5,index,view);
  const speed=Math.hypot(after.x-before.x,(after.y-before.y)*2);
  const lag=Math.min(14,Math.max(4,18.5*lengthScale*size/Math.max(speed,2.5)));
  let x=head.x,y=head.y*2,angle=heading(seconds);
  const spine:SpinePoint[]=[];
  for(let i=0;i<=37;i++) {
    const u=7-i*.5;
    if(i>0) {
      const target=heading(seconds-lag*i/37);
      // Bound curvature between adjacent sections instead of rotating a sprite.
      angle+=Math.max(-.055,Math.min(.055,angleDifference(target,angle)));
      x-=Math.cos(angle)*.5*lengthScale*size;
      y-=Math.sin(angle)*.5*lengthScale*size;
    }
    const wave=Math.sin(u*.39-seconds/LOOP_SECONDS*Math.PI*2*(1433+index*11)+fish[index].phase)*
      Math.pow(Math.max(0,(7-u)/18.5),1.6)*1.7*size*.93;
    spine.push({x:x-Math.sin(angle)*wave,y:y+Math.cos(angle)*wave,u,angle});
  }
  return spine;
}

/** Rasterize near individual spine segments, preserving gaps between tail lobes. */
function spineCells(spine:SpinePoint[],size:number,width:number,height:number,view:PondView) {
  const cells=new Map<number,{x:number;y:number;u:number;v:number;distance:number}>();
  const margin=6*size;
  for(let i=0;i<spine.length-1;i++){
    const a=spine[i],b=spine[i+1],dx=b.x-a.x,dy=b.y-a.y;
    const length2=dx*dx+dy*dy;
    const length=Math.sqrt(length2);
    for(let y=Math.max(3,Math.floor((Math.min(a.y,b.y)-margin)/2));y<=Math.min(height-4,(Math.max(a.y,b.y)+margin)/2);y++){
      for(let x=Math.max(2,Math.floor(Math.min(a.x,b.x)-margin));x<=Math.min(width-3,Math.max(a.x,b.x)+margin);x++){
        if(protectedCell(x,y,width,height,view)) continue;
        const px=x-a.x,py=y*2-a.y;
        const projection=(px*dx+py*dy)/length2;
        const t=Math.max(0,Math.min(1,projection));
        const distance=Math.pow(px-t*dx,2)+Math.pow(py-t*dy,2);
        const key=y*width+x;
        if(cells.has(key) && cells.get(key)!.distance<=distance) continue;
        // Only extend beyond the head/tail endpoints; joints stay continuous.
        const along=(i===0 && projection<0)||(i===spine.length-2 && projection>1)?projection:t;
        cells.set(key,{x,y,u:a.u+(b.u-a.u)*along,v:(px*dy-py*dx)/length/size/.93,distance});
      }
    }
  }
  return cells.values();
}

export function pondFrame(width: number, height: number, seconds: number, style: PondStyle = "ascii", view: PondView = "home"): Pixel[] {
  if (width < 64 || height < 22) return [];
  seconds = loopTime(seconds);
  const pixels = new Map<number, Pixel>();
  // Keep enough cells for fins, eyes and distinct markings on a normal terminal.
  // The former 1.25 cap made the koi look like tiny icons on large windows.
  const size = fishSize(width,height);
  // Stable seeded noise prevents the fish texture from sparkling between frames.
  const noise = (x: number, y: number, seed: number) => {
    const v = Math.sin(x * 17.17 + y * 41.73 + seed * 13.1) * 43758.5453;
    return v - Math.floor(v);
  };
  for (const [index, f] of fish.entries()) {
    const spine=fishSpine(width,height,seconds,index,view);
    for (const {x,y,u,v} of spineCells(spine,size,width,height,view)) {
        let edge = 0, fin = false;
        if (u >= -6.5 && u <= 7) {
          const t = (u + 6.5) / 13.5;
          edge = .65 + 2.40 * Math.pow(Math.sin(Math.PI * t), .78) * (.60 + .60 * t);
          // Pectoral fins, kept thin and translucent through sparser glyphs.
          const finWidth = u > .2 && u < 4 ? 1.9 * Math.sin((u-.2)/3.8*Math.PI) : 0;
          if (Math.abs(v) > edge && Math.abs(v) < edge + finWidth) {
            fin = true;
            edge += finWidth;
          }
        } else if (u > -11.5 && u < -6.5) {
          const t = (-u - 6.5) / 5;
          if (t < .22) {
            edge = .80;
          } else {
            // Two swept lobes taper to tips instead of ending in a flat fan.
            const s = (t-.22)/.78;
            const center = .30 + 2.25 * Math.pow(Math.sin(s*Math.PI/2),1.3);
            const halfWidth = .18 + .90 * Math.pow(Math.sin(Math.PI*s),.8) + .45*Math.pow(1-s,3);
            if (Math.abs(Math.abs(v)-center)>halfWidth) continue;
            edge = center+halfWidth;
          }
          fin = true;
        } else continue;
        if (Math.abs(v) > edge) continue;
        const n = noise(Math.round(u * 1.3), Math.round(v * 1.8), index);
        let ink = 0;
        const patch = Math.sin(u * .66 + f.phase) + Math.cos(v * 1.1 + index);
        const redPatch = Math.pow((u-3.5)/2.1,2)+Math.pow((v+.4)/2.2,2)<1 ||
          Math.pow((u+1.1)/2.6,2)+Math.pow((v-.65)/1.9,2)<1 ||
          Math.pow((u+4.5)/1.5,2)+Math.pow((v+.7)/1.6,2)<1;
        if (f.kind === 2) ink = n > .2 ? 3 : 0;
        else if (f.kind === 4) ink = patch > .9 ? 1 : n > .32 ? 2 : 0;
        else if (f.kind !== 3 && redPatch) ink = 1;
        if (fin || Math.abs(v) > edge * .8) ink = 4;
        const glyph = style === "blocks"
          ? fin ? "░▒"[Math.floor(n * 2)] : "▓█"[Math.floor(n * 2)]
          : fin ? ".:+"[Math.floor(n * 3)] : ":+*#@"[Math.floor(n * 5)];
        // One eye near the head, rather than random black speckles.
        if (u > 4 && u < 5.5 && Math.abs(v) > .7 && Math.abs(v) < 1.7) ink = 2;
        pixels.set(y * width + x, { x, y, glyph, ink });
    }
  }
  return [...pixels.values()];
}
