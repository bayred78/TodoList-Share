import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.todolistshare.app',
    appName: 'TodoList Share',
    webDir: 'dist',
    server: {
        androidScheme: 'https',
    },
    plugins: {
        SplashScreen: {
            launchAutoHide: true,
            backgroundColor: '#0F0F1A',
            showSpinner: false,
        },
        StatusBar: {
            style: 'DARK',
            backgroundColor: '#0F0F1A',
        },
        FirebaseAuthentication: {
            skipNativeAuth: false,
            providers: ['google.com'],
        },
    },
};

export default config;
