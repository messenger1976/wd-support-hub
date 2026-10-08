import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = process.env.HUB_API_URL || 'http://localhost:3000';

export default defineConfig({
	plugins: [react()],
	server: {
		port: 5173,
		proxy: {
			'/api': api,
			'/api.php': api,
			'/firebase-messaging-sw.js': api,
		},
	},
	build: {
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (!id.includes('node_modules')) return undefined;
					if (/[\\/](chart\.js|react-chartjs-2|@kurkle)[\\/]/.test(id)) return 'charts';
					if (/[\\/](firebase|@firebase)[\\/]/.test(id)) return 'firebase';
					return 'vendor';
				},
			},
		},
	},
});
