import { createTestRenderer } from "@opentui/core/testing";
import { RGBA, BoxRenderable, TextRenderable } from "@opentui/core";
import { paintPond } from "../src/paint.ts";
import { writeFileSync } from "node:fs";

const mode = process.argv[2] === "light" ? "light" : "dark";
const start = Number(process.argv[3] ?? 0);
const setup = await createTestRenderer({width:140,height:44});
const bg = RGBA.fromHex(mode === "dark" ? "#0a0a0a" : "#ffffff");
setup.renderer.setBackgroundColor(bg);
const fg = mode === "dark" ? "#eeeeee" : "#1a1a1a";
const logo = [
  "                                 ▄     ",
  "█▀▀█ █▀▀█ █▀▀█ █▀▀▄ █▀▀▀ █▀▀█ █▀▀█ █▀▀█",
  "█  █ █  █ █▀▀▀ █  █ █    █  █ █  █ █▀▀▀",
  "▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀",
].join("\n");
if(!process.argv.includes("--background-only")) {
setup.renderer.root.add(new TextRenderable(setup.renderer,{id:"logo",position:"absolute",left:50,top:15,content:logo,fg}));
setup.renderer.root.add(new BoxRenderable(setup.renderer,{id:"input",position:"absolute",left:32,top:22,width:76,height:5,backgroundColor:mode === "dark" ? "#1e1e1e" : "#f5f5f5"}));
setup.renderer.root.add(new TextRenderable(setup.renderer,{id:"placeholder",position:"absolute",left:35,top:23,content:'Ask anything… "Fix broken tests"',fg}));
setup.renderer.root.add(new TextRenderable(setup.renderer,{id:"model",position:"absolute",left:35,top:25,content:'Build · GPT-6 Sol OpenAI · medium',fg}));
setup.renderer.root.add(new TextRenderable(setup.renderer,{id:"keys",position:"absolute",left:69,top:28,content:'shift+tab agents  ctrl+p commands',fg}));
}
let seconds=0;
setup.renderer.addPostProcessFn(buffer=>paintPond(buffer,seconds,mode,bg,"blocks"));
const frames=[];
for(let i=0;i<45;i++){
  seconds=start+i/10;
  await setup.renderOnce();
  const frame=setup.captureSpans();
  frames.push(frame.lines.map(l=>l.spans.map(s=>({text:s.text,fg:s.fg.toInts(),bg:s.bg.toInts()}))));
}
writeFileSync(`artifacts/${mode}-frames.json`,JSON.stringify(frames));
await setup.dispose();
