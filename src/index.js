import { CustomCondApp } from "./view/CustomCondApp.js";
import { InitCustomCondManager } from "./custom-cond-manager.js";

Hooks.once("init", () => {
   // Other init-time setup can go here
});

Hooks.once("socketlib.ready", async () => {
   const socket = socketlib.registerModule("lumos-custom-conditions-for-pf1e");
   await InitCustomCondManager(socket);
});

Hooks.on("getSceneControlButtons", (controls) => {
   controls.tokens.tools.customConditions = {
      name: "customConditions",
      title: "Custom Conditions",
      icon: "fas fa-star",
      onClick: () => {
         if (!game.customConditions?.app)
            game.customConditions.app = new CustomCondApp();

         game.customConditions.app.render(true, { focus: true });
      },
      button: true
   };
});
