import { RGBA, TextAttributes, type OptimizedBuffer } from "@opentui/core";
import { palettes, pondFrame, type PondMode, type PondStyle, type PondView } from "./pond.ts";

const colors = Object.fromEntries(Object.entries(palettes).map(([mode, list]) => [mode, list.map(RGBA.fromHex)])) as Record<PondMode, RGBA[]>;
const underlays = Object.fromEntries(Object.entries(palettes).map(([mode,list])=>[
  mode,list.map(hex=>{
    const c=RGBA.fromHex(hex).toInts();
    // Muted water beneath text keeps the host's original foreground readable.
    return RGBA.fromInts(...c.slice(0,3).map(v=>Math.round(mode === "dark" ? v*.36 : 255-(255-v)*.28)) as [number,number,number]);
  }),
])) as Record<PondMode,RGBA[]>;

/** Block fish color the water beneath host text; no host glyphs or foregrounds are replaced. */
export function paintPond(buffer: OptimizedBuffer, time: number, mode: PondMode, background: RGBA, style: PondStyle = "ascii", view: PondView = "home") {
  const frame = pondFrame(buffer.width, buffer.height, time, style, view);
  buffer.withBuffers(({ char, bg, attributes }) => {
    const hostChar = style === "blocks" ? char.slice() : char;
    const eligible = frame.filter(({ x, y }) => {
      const index = y * buffer.width + x, offset = index * 4;
      if (attributes[index] & TextAttributes.INVERSE) return false;
      const base = bg[offset] === background.buffer[0] && bg[offset + 1] === background.buffer[1] && bg[offset + 2] === background.buffer[2];
      if (!base) return false;
      if (style === "blocks") return true;
      if ((char[index] !== 32 && char[index] !== 0) || attributes[index] !== 0) return false;
      // Keep word spacing, logo counters and text margins clear as well as the glyphs.
      for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= buffer.width || ny >= buffer.height) continue;
        const c = char[ny * buffer.width + nx];
        if (c !== 32 && c !== 0) return false;
      }
      // Compare RGB; metadata/alpha may encode terminal-default color intent.
      return true;
    });
    for (const p of eligible) {
      const index = p.y * buffer.width + p.x;
      if (style === "blocks") {
        let nearText = hostChar[index] !== 32 && hostChar[index] !== 0;
        for(let dx=-2;dx<=2;dx++) {
          const x=p.x+dx;
          if(x<0 || x>=buffer.width) continue;
          const c=hostChar[p.y*buffer.width+x];
          if(c!==32 && c!==0) nearText=true;
        }
        if(nearText) {
          // Change only the background color planes. Preserve complex Unicode,
          // links, bold, foregrounds and word spacing without decoding glyph IDs.
          bg.set(underlays[mode][p.ink].buffer,index*4);
          continue;
        }
      }
      buffer.drawText(p.glyph, p.x, p.y, colors[mode][p.ink], style === "blocks" ? underlays[mode][p.ink] : background);
    }
  });
}
