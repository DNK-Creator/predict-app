<template>
    <div class="loading-spinner">
        <div ref="svgContainer" class="empty-media"></div>
    </div>
</template>

<script setup>
import lottie from 'lottie-web';
import pako from 'pako';
import LoadingPepe from '@/assets/Loading-Pepe.tgs'
import { onMounted, ref } from 'vue';

const svgContainer = ref(null);

onMounted(async () => {
    // 1) Fetch the .tgs file as binary
    const res = await fetch(LoadingPepe);
    const buf = await res.arrayBuffer();

    // 2) Decompress gzip → JSON string
    const jsonStr = pako.inflate(new Uint8Array(buf), { to: 'string' });

    // 3) Parse and load into lottie
    const animationData = JSON.parse(jsonStr);
    lottie.loadAnimation({
        container: svgContainer.value,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData
    });
})

</script>

<style scoped>
.loading-spinner {
    margin: auto auto;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
    display: flex;
}

.empty-media {
    width: 10rem;
    height: 10rem;
    margin-bottom: 10rem;
}
</style>