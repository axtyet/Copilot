import { ref, onMounted } from 'vue';

export function usePwaInstall() {
    const deferredPrompt = ref(null);
    const isPwaInstalled = ref(false);

    function installPWA() {
        if (deferredPrompt.value) {
            deferredPrompt.value.prompt();
            deferredPrompt.value.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    isPwaInstalled.value = true;
                }
                deferredPrompt.value = null;
            });
        }
    }

    onMounted(() => {
        if (window.matchMedia('(display-mode: standalone)').matches) {
            isPwaInstalled.value = true;
        }
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt.value = e;
            if (!localStorage.getItem('pwaPrompted')) {
                installPWA();
                localStorage.setItem('pwaPrompted', '1');
            }
        });
        window.addEventListener('appinstalled', () => {
            isPwaInstalled.value = true;
        });
    });

    return {
        deferredPrompt,
        isPwaInstalled,
        installPWA
    };
}