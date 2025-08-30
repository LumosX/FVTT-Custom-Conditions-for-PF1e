<svelte:options accessors={true} />

<script>
   import { ApplicationShell } from "#runtime/svelte/component/application";
   import FormInput from "./components/FormInput.svelte";
   import CustomDropdown from "./components/CustomDropdown.svelte";
   import { writable, get } from "svelte/store";
   import { onMount } from "svelte";

   export let elementRoot;
   export let application;
   const FLAG_KEY = "customConditionDialogState";

   // Reactive state using Svelte stores
   const conditions = writable([]);
   const statuses = writable([]);
   const selectedCondition = writable(null);

   const increaseLevelPlaceholder = writable("1");
   const decreaseLevelPlaceholder = writable("1");
   const setDurationPlaceholder = writable("1");

   // Form state
   const setDuration = writable({ active: false, value: "", units: "round", end: "turnStart" });
   const increaseLevel = writable({ active: false, value: "" });
   const decreaseLevel = writable({ active: false, value: "" });
   const filterItems = writable({ active: false, value: "" });
   const keepOpen = writable(false);

   onMount(async () => {
      // Fetch conditions and statuses
      const folder = game.folders.find(x => x.name === "Custom Conditions" && x.type === "Item");
      if (folder) {
         const getBuffs = dir => dir.contents.filter(x => x.type === "buff");
         conditions.set([folder, ...folder.getSubfolders(true)].flatMap(getBuffs));
      }
      else {
         ui.notifications.error("Could not retrieve the custom conditions folder. Ensure it's not been tampered with.");
      }
      statuses.set([...pf1.registry.conditions].sort((a, b) => a.name.localeCompare(b.name)));

      // Load state
      const state = game.user.getFlag("world", FLAG_KEY);
      if (state) {
         setDuration.set(state.setDuration ?? get(setDuration));
         increaseLevel.set(state.increaseLevel ?? get(increaseLevel));
         decreaseLevel.set(state.decreaseLevel ?? get(decreaseLevel));
         filterItems.set(state.filterItems ?? get(filterItems));
         keepOpen.set(state.keepOpen ?? get(keepOpen));
         if (state.selectedCondition) {
            selectCondition(state.selectedCondition, state.selectedCondition.isStatus, false);
         }
      }

      // Auto-save state
      let firstRun = true;
      const combined = [setDuration, increaseLevel, decreaseLevel, filterItems, keepOpen, selectedCondition];
      for (const store of combined) {
         store.subscribe(() => {
            if (firstRun) return;
            saveState();
         });
      }
      firstRun = false;
   });

   function saveState() {
      const state = {
         setDuration: get(setDuration),
         increaseLevel: get(increaseLevel),
         decreaseLevel: get(decreaseLevel),
         filterItems: get(filterItems),
         keepOpen: get(keepOpen),
         selectedCondition: get(selectedCondition),
      };
      game.user.setFlag("world", FLAG_KEY, state);
   }

   const filteredConditions = writable([]);
   conditions.subscribe((value) => {
      const filter = get(filterItems);
      if (!filter.active || !filter.value) {
         filteredConditions.set(value);
         return;
      }
      const filterVal = filter.value.trim().toLowerCase();
      filteredConditions.set(
         value.filter((item) => {
            return (
               item.ownership[game.user.id] === 3 || item.system.tags?.map((x) => x.toLowerCase()).includes(filterVal)
            );
         }),
      );
   });
   filterItems.subscribe((filter) => {
      const allConditions = get(conditions);
      if (!filter.active || !filter.value) {
         filteredConditions.set(allConditions);
         return;
      }
      const filterVal = filter.value.trim().toLowerCase();
      filteredConditions.set(
         allConditions.filter((item) => {
            return (
               item.ownership[game.user.id] === 3 || item.system.tags?.map((x) => x.toLowerCase()).includes(filterVal)
            );
         }),
      );
   });

   selectedCondition.subscribe(async (cond) => {
      if (!cond) return;

      if (cond.isStatus) {
         increaseLevelPlaceholder.set("0");
         decreaseLevelPlaceholder.set("0");
         setDurationPlaceholder.set("1");
      } 
      else {
         const condItem = game.items.get(cond.id);
         if (!condItem) return;

         increaseLevelPlaceholder.set(condItem.system.level || "1");
         decreaseLevelPlaceholder.set(condItem.system.level || "1");

         const durSecs = await condItem.getDuration();
         let durationValue = 1;
         switch (get(setDuration).units) {
            case "round":
               durationValue = durSecs / CONFIG.time.roundTime;
               break;
            case "minute":
               durationValue = durSecs / 60;
               break;
            case "hour":
               durationValue = durSecs / 3600;
               break;
         }
         setDurationPlaceholder.set(String(Math.round(durationValue)));

         let durationUnits = condItem.system.duration.units;
         if (!["round", "minute", "hour"].includes(durationUnits)) durationUnits = "round";
         setDuration.update((s) => ({ ...s, units: durationUnits }));

         let durationEndTiming = condItem.system.duration.end;
         if (!["turnStart", "turnEnd", "initiative", "initiativeEnd"].includes(durationEndTiming))
            durationEndTiming = "turnStart";
         setDuration.update((s) => ({ ...s, end: durationEndTiming }));
      }
   });

   function selectCondition(condition) {
      selectedCondition.set(condition);
   }

   function parseValue(value, placeholder) {
      const num = parseInt(value, 10);
      return isNaN(num) ? parseInt(get(placeholder), 10) : num;
   }

   function applyCondition() {
      const sc = get(selectedCondition);
      if (!sc) return;

      game.customConditions.apply(game.user.id, {
         conditionId: sc.id,
         isStatus: sc.isStatus,
         increaseLevel: {
            active: get(increaseLevel).active,
            value: parseValue(get(increaseLevel).value, increaseLevelPlaceholder),
         },
         setDuration: {
            active: get(setDuration).active,
            value: parseValue(get(setDuration).value, setDurationPlaceholder),
            units: get(setDuration).units,
            end: get(setDuration).end,
         },
      });

      if (!get(keepOpen)) {
         application.close();
      }
   }

   function removeCondition() {
      const sc = get(selectedCondition);
      if (!sc) return;

      game.customConditions.remove(game.user.id, {
         conditionId: sc.id,
         isStatus: sc.isStatus,
         decreaseLevel: {
            active: get(decreaseLevel).active,
            value: parseValue(get(decreaseLevel).value, decreaseLevelPlaceholder),
         },
      });

      if (!get(keepOpen)) {
         application.close();
      }
   }

   function sanitizeNumericInput(event) {
      let value = (event.target.value || "").replace(/[^0-9]/g, "");
      if (value !== "") value = String(Math.min(Math.max(parseInt(value, 10), 0), 9999));
      event.target.value = value;
   }

   const allItems = writable([]);
   filteredConditions.subscribe(fc => {
       statuses.subscribe(s => {
           const mappedStatuses = s.map(status => ({
               id: status._id,
               name: status.name,
               img: status.texture,
               isStatus: true
           }));
           allItems.set([...fc, ...mappedStatuses]);
       });
   });

</script>

<ApplicationShell bind:elementRoot>
   <main>
      <div class="form-group form-group-top">
         <label for="custom-select">Select Condition:</label>
         <CustomDropdown
            items={$allItems}
            selectedItem={$selectedCondition}
            on:select={(e) => selectCondition(e.detail)}
            placeholder="Select a condition"
         >
            <div slot="selected" let:item class="custom-option">
               <img src={item.img} alt={item.name} class="option-icon" style={item.isStatus ? "filter: invert(1)" : ""}/>
               <span>{item.name}</span>
            </div>
            <div slot="option" let:item class="custom-option">
               <img src={item.img} alt={item.name} class="option-icon" style={item.isStatus ? "filter: invert(1)" : ""}/>
               <span>{item.name}</span>
            </div>
         </CustomDropdown>
      </div>
      <hr />

      <div class="section-mini-title">On applying condition:</div>
      <FormInput
         id="set-duration"
         label="Set duration to"
         hasTextbox={true}
         bind:checked={$setDuration.active}
         bind:value={$setDuration.value}
         placeholder={$setDurationPlaceholder}
         on:input={sanitizeNumericInput}
         tooltipText="If checked and the effect has a duration, the duration of the effect on a target will be set (or reset, if already present) to the specified duration (rounds/minutes/hours) and ending time condition."
      >
         <select bind:value={$setDuration.units}>
            <option value="round">rounds</option>
            <option value="minute">minutes</option>
            <option value="hour">hours</option>
         </select>
      </FormInput>
      <div
         class="form-group indented"
         data-tooltip="The effect will end on the respective round:<br><em>'Start/end of target's turn':</em> When <strong>the target's</strong> turn begins/ends.<br><em>'(After) This initiative count':</em> When this initiative count is reached/when the turn at this initiative count ends."
         data-tooltip-direction="UP"
      >
         <label for="duration-end">Ending at:</label>
         <select id="duration-end" bind:value={$setDuration.end}>
            <option value="turnStart">Start of target's turn</option>
            <option value="turnEnd">End of target's turn</option>
            <option value="initiative">This initiative count</option>
            <option value="initiativeEnd">After this initiative count</option>
         </select>
      </div>
      <FormInput
         id="increase-level"
         label="If present, increase level by"
         hasTextbox={true}
         bind:checked={$increaseLevel.active}
         bind:value={$increaseLevel.value}
         placeholder={$increaseLevelPlaceholder}
         on:input={sanitizeNumericInput}
         tooltipText="Increases the level of the effect (if any) on a target that already has it. An effect without a level will never be added if already present."
         disabled={$selectedCondition?.isStatus}
      />

      <hr />
      <div class="section-mini-title">On removing condition:</div>
      <FormInput
         id="decrease-level"
         label="Only decrease level by"
         hasTextbox={true}
         bind:checked={$decreaseLevel.active}
         bind:value={$decreaseLevel.value}
         placeholder={$decreaseLevelPlaceholder}
         on:input={sanitizeNumericInput}
         tooltipText="Decreases the level of the effect (if any) instead of removing it fully. An effect without a level will always be completely removed."
         disabled={$selectedCondition?.isStatus}
      />

      <hr />
      <FormInput
         id="filter-items"
         label="Show only items I own, or with tag"
         hasTextbox={true}
         bind:checked={$filterItems.active}
         bind:value={$filterItems.value}
         textboxClass="inline-textbox-wide"
         tooltipText='"Own" means your user is set as an "owner" of the item in Foundry. If you specify a tag, comparison is not case-sensitive.'
      />
      <FormInput id="keep-open" label="Keep window open after applying/removing effect" bind:checked={$keepOpen} />
   </main>

   <footer class="dialog-buttons">
      <button type="button" class="dialog-button" on:click={applyCondition} disabled={!$selectedCondition}>
         <i class="fas fa-check"></i> Apply
      </button>
      <button type="button" class="dialog-button" on:click={removeCondition} disabled={!$selectedCondition}>
         <i class="fas fa-times"></i> Remove
      </button>
   </footer>
</ApplicationShell>

<style lang="scss">
    main {
        padding: 0.5em;
    }
    .form-group-top {
        display: flex;
        align-items: center;
    }
    .form-group-top > :global(.custom-select) {
        flex: 1;
        margin-left: 0.5em;
    }
    .indented {
        padding-left: 33px; // 20 px checkbox, 2x5 margins, 3 px gap
		margin-bottom: 5px;
    }
    .section-mini-title {
       font-weight: bold;
       margin-top: 5px;
       margin-bottom: 5px;
    }


    .form-group label {
       white-space: nowrap;
       overflow: hidden;
    }
    .form-group select {
       height: 26px;
       color: var(--color-text-dark-primary);
       margin: 0 5px;
    }
    footer.dialog-buttons {
       border-top: 1px solid var(--color-border-light-tertiary);
       padding-top: 0.5em;
       margin-top: 0.5em;
       display: flex;
       justify-content: flex-end;
       gap: 0.5em;
    }
</style>
