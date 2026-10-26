import { test, expect } from "bun:test";
import { pondFrame, protectedCell, fishPose, fishSpine, fishHeading, LOOP_SECONDS } from "../src/pond.ts";

test("fish stay within terminal chrome at different sizes", () => {
  for (const [w,h] of [[80,24], [120,36], [160,50], [240,70]]) {
    for (const t of [0, 1, 20, 100, 1000]) {
      const frame = pondFrame(w,h,t);
      expect(frame.length).toBeGreaterThan(10);
      for (const p of frame) {
        expect(protectedCell(p.x,p.y,w,h)).toBe(false);
        expect(p.glyph.length).toBe(1);
        expect(p.ink).toBeGreaterThanOrEqual(0);
        expect(p.ink).toBeLessThan(5);
      }
    }
  }
});
test("tiny terminal hides fish rather than covering the composer", () => {
  expect(pondFrame(40,20,0)).toEqual([]);
  expect(pondFrame(120,15,0)).toEqual([]);
});
test("swimming changes geometry, frozen time remains deterministic", () => {
  expect(pondFrame(140,45,0)).toEqual(pondFrame(140,45,0));
  expect(pondFrame(140,45,0)).not.toEqual(pondFrame(140,45,1));
});
test("block mode uses only block glyphs, with identical fish shapes and colors", () => {
  const ascii = pondFrame(140,44,1,"ascii");
  const blocks = pondFrame(140,44,1,"blocks");
  expect(blocks.length).toBe(ascii.length);
  for (let i=0;i<blocks.length;i++) {
    expect("░▒▓█").toContain(blocks[i].glyph);
    expect({...blocks[i],glyph:""}).toEqual({...ascii[i],glyph:""});
  }
});
test("the entire raster repeats exactly after one hour, including tails and colors", () => {
  for (const view of ["home","session"] as const) for (const style of ["ascii","blocks"] as const) for (const time of [0,.125,19.5,813.75,3599.99]) {
    expect(pondFrame(140,44,time,style,view)).toEqual(pondFrame(140,44,time+LOOP_SECONDS,style,view));
  }
});
test("conversation fish wander across the reading area and remain smooth at the seam",()=>{
  for(let i=0;i<5;i++){
    const samples=Array.from({length:300},(_,n)=>fishPose(140,44,n*3,i,"session"));
    expect(samples.some(p=>p.x>35 && p.x<105 && p.y>15 && p.y<30)).toBe(true);
    const a=fishPose(140,44,3599.999,i,"session"),b=fishPose(140,44,.001,i,"session");
    expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeLessThan(.02);
    expect(Math.abs(Math.sin(a.angle-b.angle))).toBeLessThan(.01);
  }
});
test("positions and headings cross the loop seam smoothly and roam across the pond", () => {
  for(let i=0;i<5;i++) {
    const before = fishPose(140,44,LOOP_SECONDS-.001,i);
    const after = fishPose(140,44,.001,i);
    expect(Math.hypot(after.x-before.x,after.y-before.y)).toBeLessThan(.02);
    expect(Math.abs(Math.sin(after.angle-before.angle))).toBeLessThan(.01);
    const points=Array.from({length:120},(_,n)=>fishPose(140,44,n*3,i));
    expect(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x))).toBeGreaterThan(75);
    expect(Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))).toBeGreaterThan(20);
  }
});
test("home koi cross the logo area and turn both ways instead of orbiting it",()=>{
  expect(protectedCell(70,17,140,44,"home")).toBe(false);
  for(let i=0;i<5;i++){
    const poses=Array.from({length:1200},(_,n)=>fishPose(140,44,n*3,i,"home"));
    expect(poses.some(p=>p.x>50 && p.x<90 && p.y>14 && p.y<20)).toBe(true);
    const turns=poses.slice(1).map((p,n)=>Math.sin(p.angle-poses[n].angle));
    expect(turns.some(t=>t>.02)).toBe(true);
    expect(turns.some(t=>t<-.02)).toBe(true);
  }
  const pixels=pondFrame(140,44,0,"blocks","home");
  expect(pixels.some(p=>p.x>50 && p.x<90 && p.y>14 && p.y<20)).toBe(true);
});

test("steering never snaps around at slow turns or the loop seam",()=>{
  for(let i=0;i<5;i++) for(let t=0;t<LOOP_SECONDS;t+=.4){
    const delta=fishHeading(140,44,t+.4,i)-fishHeading(140,44,t,i);
    expect(Math.abs(Math.atan2(Math.sin(delta),Math.cos(delta)))).toBeLessThanOrEqual(.16001);
  }
});

test("heads lead curved bodies, which also settle straight, with a continuous loop",()=>{
  for(let i=0;i<5;i++){
    let minimum=10,maximum=0;
    for(let t=0;t<LOOP_SECONDS;t+=10){
      const spine=fishSpine(140,44,t,i);
      const delta=Math.abs(Math.atan2(Math.sin(spine[0].angle-spine[24].angle),Math.cos(spine[0].angle-spine[24].angle)));
      minimum=Math.min(minimum,delta);maximum=Math.max(maximum,delta);
      for(let j=1;j<spine.length;j++) expect(Math.abs(spine[j].angle-spine[j-1].angle)).toBeLessThanOrEqual(.055001);
    }
    expect(maximum).toBeGreaterThan(.3);
    expect(minimum).toBeLessThan(.1);
    const a=fishSpine(140,44,LOOP_SECONDS-.001,i),b=fishSpine(140,44,.001,i);
    for(let j=0;j<a.length;j++) expect(Math.hypot(a[j].x-b[j].x,a[j].y-b[j].y)).toBeLessThan(.2);
  }
});

test("fish keep travelling, face their travel and remain distributed over the full hour",()=>{
  for(const [width,height] of [[80,24],[140,44],[240,70]]){
    const unit=Math.min(width,height*2);
    for(let t=0;t<LOOP_SECONDS;t+=2){
      const poses=Array.from({length:5},(_,i)=>fishPose(width,height,t,i));
      expect(Math.max(...poses.map(p=>p.x))-Math.min(...poses.map(p=>p.x))).toBeGreaterThan(width*.5);
      expect(Math.max(...poses.map(p=>p.y))-Math.min(...poses.map(p=>p.y))).toBeGreaterThan((height-12)*.5);
      for(let i=0;i<5;i++){
        const p=poses[i],next=fishPose(width,height,t+2,i);
        expect(Math.hypot(next.x-p.x,(next.y-p.y)*2)).toBeGreaterThan(unit*.025);
        const before=fishPose(width,height,t-.1,i),after=fishPose(width,height,t+.1,i);
        const travel=Math.atan2((after.y-before.y)*2,after.x-before.x);
        expect(Math.cos(fishHeading(width,height,t,i)-travel)).toBeGreaterThan(.999);
        for(let j=i+1;j<5;j++) expect(Math.hypot(p.x-poses[j].x,(p.y-poses[j].y)*2)).toBeGreaterThan(unit*.13);
      }
    }
  }
});
