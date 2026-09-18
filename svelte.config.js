import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"

const NoWarns = new Set([
    "a11y-click-events-have-key-events",
    "a11y-no-static-element-interactions",
    "a11y-no-noninteractive-element-interactions",
    "a11y-missing-attribute",
    "a11y-missing-content",
    "a11y-autofocus"
]);

export default {
    preprocess: vitePreprocess(),
    onwarn: (warning, handler) => {
        if (NoWarns.has(warning.code)) return;
        handler(warning);
    }
}
