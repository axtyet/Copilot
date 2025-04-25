<template>
    <div id="app">
        <TitleBar v-if="!isLyricsRoute" />
        <RouterView />
        <Disclaimer v-if="!isLyricsRoute" />
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import Disclaimer from '@/components/Disclaimer.vue';
import TitleBar from '@/components/TitleBar.vue';

const route = useRoute();
const isLyricsRoute = computed(() => route.path === '/lyrics');
</script>

<style scoped>
.container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px;
}
</style>