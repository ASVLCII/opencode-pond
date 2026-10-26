import { test, expect } from "bun:test";
import pond from "../src/tui.ts";
import { createTestRenderer } from "@opentui/core/testing";
import { RGBA } from "@opentui/core";
import type { Context } from "@opencode/plugin/tui/context";

test("plugin commands switch modes, hide, pause and release the renderer on unload", async () => {
  const setup = await createTestRenderer({width:140,height:44});
  const background = RGBA.fromHex("#0a0a0a");
  setup.renderer.setBackgroundColor(background);
  const prefs = {enabled:true,paused:false,style:"blocks"};
  let command: {run:(input?:string)=>Promise<void>};
  let commands: Array<{id:string;slash:{name:string};run:(input?:string)=>Promise<void>}>;
  const notices: unknown[] = [];
  let mode = "dark", route = "home", removed = false;
  const context = {
    renderer:setup.renderer,
    get themeMode(){return mode;},
    theme:{background:{base:background}},
    storage:{store:()=>[prefs,async (fn:(draft:typeof prefs)=>void)=>fn(prefs)]},
    keymap:{layer:(fn:()=>any)=>{commands=fn().commands;command=commands[0];},dispatch:(id:string)=>{expect(id).toBe("theme.switch_mode");mode=mode==="dark"?"light":"dark";}},
    ui:{router:{current:()=>({type:route})},slot:(slot:{render:()=>void})=>{slot.render();return ()=>{removed=true;};},toast:{show:(n:unknown)=>notices.push(n)},dialog:{select:async()=>"white"}},
  } as unknown as Context;
  const cleanup = await pond.setup(context);
  try {
    await setup.renderOnce();
    const visible = setup.captureCharFrame();
    expect(visible.trim().length).toBeGreaterThan(30);
    await command!.run("off");
    await setup.renderOnce();
    expect(setup.captureCharFrame().trim()).toBe("");
    await command!.run("on");
    const white=commands!.find(c=>c.slash.name==="white")!;
    const ascii=commands!.find(c=>c.slash.name==="ascii-koi")!;
    const koi=commands!.find(c=>c.slash.name==="koi")!;
    await koi.run("off"); expect(prefs.enabled).toBe(false);
    await koi.run("off"); expect(prefs.enabled).toBe(false);
    await koi.run("on"); expect(prefs.enabled).toBe(true);
    await koi.run(); expect(prefs.enabled).toBe(false);
    await koi.run(); expect(prefs.enabled).toBe(true);
    await white.run("on"); expect(mode).toBe("light");
    await white.run("on"); expect(mode).toBe("light");
    await white.run("off"); expect(mode).toBe("dark");
    await white.run(); expect(mode).toBe("light");
    await white.run(); expect(mode).toBe("dark");
    await ascii.run("on"); expect(prefs.style).toBe("ascii");
    await ascii.run("off"); expect(prefs.style).toBe("blocks");
    await ascii.run(); expect(prefs.style).toBe("ascii");
    await ascii.run(); expect(prefs.style).toBe("blocks");
    await white.run("invalid"); expect(mode).toBe("dark");
    await ascii.run("invalid"); expect(prefs.style).toBe("blocks");
    await koi.run("invalid"); expect(prefs.enabled).toBe(true);
    expect(notices).toHaveLength(3);
    await command!.run("off");
    await ascii.run("on"); expect(prefs.enabled).toBe(false);
    await ascii.run("off");
    await command!.run("on");
    await command!.run("pause"); expect(prefs.paused).toBe(true);
    await command!.run("resume"); expect(prefs.paused).toBe(false);
    await command!.run("white"); expect(mode).toBe("light");
    await command!.run("dark"); expect(mode).toBe("dark");
    await command!.run("ascii"); expect(prefs.style).toBe("ascii");
    await command!.run("blocks"); expect(prefs.style).toBe("blocks");
    await command!.run(); expect(mode).toBe("light");
    route="session";
    await setup.renderOnce();
    expect(setup.captureCharFrame().trim().length).toBeGreaterThan(30);
    route="plugin";
    await setup.renderOnce();
    expect(setup.captureCharFrame().trim()).toBe("");
    route="home";
    await setup.renderOnce();
    expect(setup.captureCharFrame().trim().length).toBeGreaterThan(30);
  } finally {
    if (cleanup) await cleanup();
    await setup.renderOnce();
    expect(setup.captureCharFrame().trim()).toBe("");
    expect(removed).toBe(true);
    await setup.dispose();
  }
});

test("a removed renderer hook disables the pond without touching the host", async () => {
  const notices: unknown[] = [];
  const result = await pond.setup({
    renderer: {}, ui: {toast:{show:(notice:unknown)=>notices.push(notice)}},
  } as unknown as Context);
  expect(result).toBeUndefined();
  expect(notices).toHaveLength(1);
});

test("a buffer API failure removes the drawing callback and reports once", async () => {
  const notices: unknown[] = [];
  let draw: (buffer:unknown)=>void = ()=>{};
  let removed = 0;
  const cleanup = await pond.setup({
    renderer: {
      width:140,height:44,
      addPostProcessFn:(fn:typeof draw)=>{draw=fn;},
      removePostProcessFn:()=>{removed++;},requestRender:()=>{},
    },
    storage:{store:()=>[{enabled:true,paused:true},()=>{}]},
    themeMode:"dark",theme:{background:{base:RGBA.fromHex("#0a0a0a")}},
    ui:{toast:{show:(notice:unknown)=>notices.push(notice)},router:{current:()=>({type:"home"})},slot:()=>()=>{}},
  } as unknown as Context);
  try {
    draw({width:140,height:44,withBuffers:()=>{throw new Error("changed API");}});
    draw({width:140,height:44});
    expect(removed).toBe(1);
    expect(notices).toHaveLength(1);
  } finally {if(cleanup) await cleanup();}
});
