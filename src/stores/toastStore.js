import { create } from 'zustand';

const useToastStore = create((set) => ({
    toasts: [],

    addToast: (message, type = 'info') => {
        const id = Date.now();
        set((state) => ({
            toasts: [...state.toasts, { id, message, type }],
        }));

        // 3초 후 자동 제거
        setTimeout(() => {
            set((state) => ({
                toasts: state.toasts.filter((t) => t.id !== id),
            }));
        }, 3000);
    },

    removeToast: (id) => {
        set((state) => ({
            toasts: state.toasts.filter((t) => t.id !== id),
        }));
    },
}));

export default useToastStore;
