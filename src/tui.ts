import { Plugin } from "@opencode/plugin/tui";
import { paintPond } from "./paint.ts";
import { LOOP_SECONDS } from "./pond.ts";

export default Plugin.define({
  id: "opencode.pond",
  setup(context) {
    const { renderer } = context;
    if (typeof renderer?.addPostProcessFn !== "function" || typeof renderer?.removePostProcessFn !== "function") {
      context.ui.toast.show({ title: "Pond background", message: "This OpenCode renderer needs a pond compatibility update. The pond is disabled.", variant: "info" });
      return;
    }
    const reducedMotion = process.env.REDUCE_MOTION === "1" || process.env.POND_REDUCED_MOTION === "1";
    const [settings, update] = context.storage.store("preferences", {
      initial: { enabled: true, paused: reducedMotion, style: "blocks" as "ascii" | "blocks" },
    });
    let seconds = 0, previous = performance.now();
    let incompatible = false;
    const active = () => !incompatible && settings.enabled && ["home", "session"].includes(context.ui.router.current().type);
    const paint = (buffer: Parameters<typeof paintPond>[0]) => {
      if (!active()) return;
      try {
        const view = context.ui.router.current().type === "session" ? "session" : "home";
        paintPond(buffer, seconds, context.themeMode, context.theme.background.base, settings.style ?? "blocks", view);
      } catch {
        incompatible = true;
        // Never let a renderer API change break the host UI or retry every frame.
        clearInterval(timer);
        renderer.removePostProcessFn(paint);
        context.ui.toast.show({ title: "Pond background", message: "The pond stopped after a rendering error. OpenCode can continue; the plugin needs checking.", variant: "info" });
        renderer.requestRender();
      }
    };
    renderer.addPostProcessFn(paint);
    const timer = setInterval(() => {
      const now = performance.now();
      const elapsed = Math.min(.2, (now - previous) / 1000);
      previous = now;
      if (!active() || settings.paused || reducedMotion || renderer.width < 64 || renderer.height < 22) return;
      seconds = (seconds + elapsed) % LOOP_SECONDS;
      renderer.requestRender();
    }, 1000 / 15);
    timer.unref?.();

    const setMode = (mode: "dark" | "light") => {
      if (context.themeMode !== mode) context.keymap.dispatch("theme.switch_mode");
      renderer.requestRender();
    };
    const unregister = context.ui.slot({ append: "app", render: () => {
      context.keymap.layer(() => ({
        mode: "global",
        commands: [{
          id: "pond.settings", title: "Pond background", group: "Pond", palette: true,
          slash: { name: "pond", arguments: true },
          async run(input) {
            let choice = input?.trim().toLowerCase();
            if (!choice) choice = await context.ui.dialog.select({
              title: "Pond background",
              options: [
                { title: "Dark pond", value: "dark" },
                { title: "White pond", value: "white" },
                { title: "Block koi", value: "blocks" },
                { title: "ASCII koi", value: "ascii" },
                { title: settings.paused ? "Resume swimming" : "Pause swimming", value: "pause" },
                { title: settings.enabled ? "Hide pond" : "Show pond", value: "toggle" },
              ],
            });
            if (!choice) return;
            if (choice === "dark" || choice === "white" || choice === "light") {
              setMode(choice === "dark" ? "dark" : "light");
              await update(s => { s.enabled = true; });
            } else if (choice === "blocks" || choice === "block" || choice === "ascii") {
              await update(s => { s.style = choice === "ascii" ? "ascii" : "blocks"; });
            } else if (choice === "pause" || choice === "resume") {
              await update(s => { s.paused = choice === "resume" ? false : !s.paused; });
            } else if (["toggle", "on", "off"].includes(choice)) {
              await update(s => { s.enabled = choice === "toggle" ? !s.enabled : choice === "on"; });
            } else context.ui.toast.show({ message: "Pond: dark, white, blocks, ascii, pause, resume, on, off", variant: "info" });
            renderer.requestRender();
          },
        }, {
          id: "pond.white", title: "White pond on/off", group: "Pond", palette: true,
          slash: { name: "white", arguments: true },
          async run(input) {
            const value = input?.trim().toLowerCase();
            if (value && value !== "on" && value !== "off") {
              context.ui.toast.show({ message: "Usage: /white on or /white off", variant: "info" });
              return;
            }
            setMode(value ? value === "on" ? "light" : "dark" : context.themeMode === "light" ? "dark" : "light");
          },
        }, {
          id: "pond.ascii", title: "ASCII koi on/off", group: "Pond", palette: true,
          slash: { name: "ascii-koi", arguments: true },
          async run(input) {
            const value = input?.trim().toLowerCase();
            if (value && value !== "on" && value !== "off") {
              context.ui.toast.show({ message: "Usage: /ascii-koi on or /ascii-koi off", variant: "info" });
              return;
            }
            await update(s => {
              s.style = value ? value === "on" ? "ascii" : "blocks" : (s.style ?? "blocks") === "ascii" ? "blocks" : "ascii";
            });
            renderer.requestRender();
          },
        }, {
          id: "pond.visibility", title: "Koi on/off", group: "Pond", palette: true,
          slash: { name: "koi", arguments: true },
          async run(input) {
            const value = input?.trim().toLowerCase();
            if (value && value !== "on" && value !== "off") {
              context.ui.toast.show({ message: "Usage: /koi on or /koi off", variant: "info" });
              return;
            }
            await update(s => { s.enabled = value ? value === "on" : !s.enabled; });
            renderer.requestRender();
          },
        }],
      }));
      return null;
    }});
    return () => {
      clearInterval(timer);
      unregister();
      renderer.removePostProcessFn(paint);
      renderer.requestRender();
    };
  },
});
