import { create } from 'zustand';

const getSystemTheme = () =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const applyTheme = (theme) => {
    const resolved = theme === 'system' ? getSystemTheme() : theme;
    document.documentElement.setAttribute('data-theme', resolved);
};

const useThemeStore = create((set, get) => ({
    theme: localStorage.getItem('theme') || 'system',

    setTheme: (theme) => {
        localStorage.setItem('theme', theme);
        applyTheme(theme);
        set({ theme });
    },

    initTheme: () => {
        const saved = localStorage.getItem('theme') || 'system';
        applyTheme(saved);
        set({ theme: saved });

        // system 모드일 때 OS 테마 변경 감지
        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = () => {
            if (get().theme === 'system') {
                applyTheme('system');
            }
        };
        mql.addEventListener('change', handler);

        // cleanup 함수 반환
        return () => mql.removeEventListener('change', handler);
    },
}));

export default useThemeStore;
