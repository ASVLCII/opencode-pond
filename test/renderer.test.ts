import { test, expect } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { BoxRenderable, TextRenderable, RGBA } from "@opentui/core";
import { paintPond } from "../src/paint.ts";
import { pondFrame } from "../src/pond.ts";

for (const mode of ["dark", "light"] as const) {
  test(`native renderer paints ${mode} koi without altering host text or panels`, async () => {
    const setup = await createTestRenderer({width:140,height:44});
    const bg = RGBA.fromHex(mode === "dark" ? "#090909" : "#fafafa");
    setup.renderer.setBackgroundColor(bg);
    const text = new TextRenderable(setup.renderer,{id:"host-label",content:"KEEP HOST",position:"absolute",left:12,top:10});
    const panel = new BoxRenderable(setup.renderer,{id:"panel",position:"absolute",left:90,top:4,width:35,height:10,backgroundColor:mode === "dark" ? "#202020" : "#eeeeee"});
    setup.renderer.root.add(text); setup.renderer.root.add(panel);
    await setup.renderOnce();
    const before = setup.captureCharFrame();
    setup.renderer.addPostProcessFn(buffer => paintPond(buffer,0,mode,bg));
    await setup.renderOnce();
    const after = setup.captureCharFrame();
    expect(after).toContain("KEEP HOST");
    expect(after).not.toEqual(before);
    const rows = after.split("\n");
    for(let y=4;y<14;y++) expect(rows[y].slice(90,125)).toBe(" ".repeat(35));
    await setup.dispose();
  });
}

for (const mode of ["dark","light"] as const) {
  test(`block koi swim beneath ${mode} message letters while preserving their foreground`,async()=>{
    const setup=await createTestRenderer({width:140,height:44});
    const bg=RGBA.fromHex(mode==="dark"?"#0a0a0a":"#ffffff");
    setup.renderer.setBackgroundColor(bg);
    const p=pondFrame(140,44,0,"blocks","session").find(p=>p.ink===1)!;
    setup.renderer.root.add(new TextRenderable(setup.renderer,{id:"message",position:"absolute",left:p.x,top:p.y,content:"sample words",fg:mode==="dark"?"#eeeeee":"#1a1a1a"}));
    const colorAt=()=>{
      let x=0;
      for(const span of setup.captureSpans().lines[p.y].spans){
        if(p.x>=x && p.x<x+span.width) return {fg:span.fg.toInts(),bg:span.bg.toInts()};
        x+=span.width;
      }
      throw new Error("missing sampled cell");
    };
    try {
      await setup.renderOnce(); const before=colorAt();
      setup.renderer.addPostProcessFn(buffer=>paintPond(buffer,0,mode,bg,"blocks","session"));
      await setup.renderOnce(); const after=colorAt();
      expect(setup.captureCharFrame()).toContain("sample words");
      expect(after.fg).toEqual(before.fg);
      expect(after.bg).not.toEqual(before.bg);
    } finally {await setup.dispose();}
  });
}
