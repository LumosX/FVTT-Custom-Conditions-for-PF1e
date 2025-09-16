<script>
    export let id = "";
    export let label = "";
    export let tooltipText = null;
    export let checked = false;
    export let value = "";
    export let placeholder = "";
    export let hasTextbox = false;
    export let textboxClass = "inline-textbox";
    export let disabled = false;
</script>

<div class="form-group" class:disabled-group={disabled} data-tooltip={tooltipText} data-tooltip-direction="UP">
    <input type="checkbox" {id} name={id} bind:checked on:change {disabled}>
    <label for={id}>
        {label}
        {#if hasTextbox}
            <input type="text" class={textboxClass} id="{id}-value" name="{id}-value" {placeholder} bind:value on:input {disabled}>
        {/if}
        <slot></slot>
    </label>
</div>

<style lang="scss">
    .form-group {
        display: flex;
        align-items: center;
        margin-bottom: 5px;

        &.centred-tickbox label {
            display: flex !important;
            align-items: center;
            white-space: nowrap;
            overflow: hidden;
        }

        &.disabled-group {
            opacity: 0.5;
            pointer-events: none;
        }

        label {
            display: flex;
            align-items: center;
            white-space: nowrap;
        }

        input {
            margin: 0 5px;
        }
    }
</style>