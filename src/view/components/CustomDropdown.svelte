<script>
    import { createEventDispatcher } from 'svelte';
    import { writable } from 'svelte/store';

    export let items = [];
    export let selectedItem = null;
    export let placeholder = "Select an item";

    const dispatch = createEventDispatcher();
    const isDropdownOpen = writable(false);

    function selectItem(item) {
        dispatch('select', item);
        isDropdownOpen.set(false);
    }

    function handleKeydown(event, action) {
       if (event.key === 'Enter' || event.key === ' ') {
           event.preventDefault();
           action();
       }
   }
</script>

<div class="custom-select">
    <div class="select-selected"
         role="button"
         tabindex="0"
         on:click={() => isDropdownOpen.update(v => !v)}
         on:keydown={(e) => handleKeydown(e, () => isDropdownOpen.update(v => !v))}>
        {#if selectedItem}
            <slot name="selected" item={selectedItem}>
                <span>{selectedItem.name}</span>
            </slot>
        {:else}
            &nbsp;&nbsp;{placeholder}
        {/if}
    </div>
    {#if $isDropdownOpen}
        <div class="select-items" role="listbox">
            {#each items as item (item.id)}
                <div class="custom-option"
                     role="option"
                     tabindex="0"
                     aria-selected={selectedItem?.id === item.id}
                     on:click={() => selectItem(item)}
                     on:keydown={(e) => handleKeydown(e, () => selectItem(item))}>
                    <slot name="option" item={item}>
                        <span>{item.name}</span>
                    </slot>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style lang="scss">
    .custom-select {
        position: relative;
        width: 100%;
    }
    .select-selected {
        min-height: 28px;
        background: rgba(0, 0, 0, 0.05);
        border-radius: 3px;
        border: 1.5px solid var(--color-border-light-tertiary);
        cursor: pointer;
        display: flex;
        align-items: center;
        padding-left: 5px;
    }
    .select-selected::after {
        content: "\f107";
        font-family: var(--font-awesome);
        font-weight: 900;
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
    }
    .select-items {
        display: block;
        position: absolute;
        background-color: var(--pf1-faint);
        top: 100%;
        left: 0;
        right: 0;
        z-index: 99;
        max-height: 200px;
        overflow-y: auto;
        border: 1px solid #ccc;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    }
    .custom-option {
        padding: 2px 5px;
        display: flex;
        align-items: center;
        cursor: pointer;
    }
    :global(.custom-option) {
        display: flex;
        align-items: center;
    }
    .custom-option:hover {
        background-color: var(--pf1-item-list-hover-bg);
        color: var(--pf1-item-list-hover-text);
    }
    /* Can't be scoped to this component if we want to style the image from the parent */
    :global(.option-icon) {
        width: 26px;
        height: 26px;
        margin-right: 5px;
        border: none;
    }
</style>