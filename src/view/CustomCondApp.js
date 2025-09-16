import { SvelteApp } from "#runtime/svelte/application";
import { deepMerge } from "#runtime/util/object";

import CustomCondDialog from "./CustomCondDialog.svelte";

export class CustomCondApp extends SvelteApp
{
   /**
    * Default Application options
    *
    * @returns {SvelteApp.Options} options - SvelteApp options.
    * @see https://typhonjs-fvtt-lib.github.io/api-docs/interfaces/_runtime_svelte_application.SvelteApp.Options.html
    */
   static get defaultOptions()
   {
      return deepMerge(super.defaultOptions, {
         title: "Custom Conditions",
         width: 400,
         height: "auto",
         resizable: true,
         classes: ["application", "app", "window-app", "dialog", "pf1", "themed", "theme-light"],
         headerButtonNoClose: true,
         headerButtonNoLabel: false,
         svelte: {
            class: CustomCondDialog,
            target: document.body,
            props: function() {
               return { application: this };
            }
         }
      });
   }

   /**
    * @override
    */
   _getHeaderButtons()
   {
      const buttons = super._getHeaderButtons();
      buttons.unshift({
         label: "Close",
         icon: "fas fa-xmark",
         onclick: () => this.close(),
         class: "header-button control close",
         styles: { 
            "flex": "0 0 var(--button-size)",
            "background": "var(--button-background-color)",
            "border": "none"
         }
      });
      return buttons;
   }
}