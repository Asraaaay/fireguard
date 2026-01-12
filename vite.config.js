import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Allow requests from the Ngrok URL
    allowedHosts: [
      '6e5ff33c897b.ngrok-free.app', // Replace with your actual Ngrok URL
      'localhost', // You can also allow localhost
    ],
  },
});

//import { defineConfig } from 'vite';
//import react from '@vitejs/plugin-react';
//export default defineConfig({
 // plugins: [react()],
  //server: {
   // host: 'localhost', // Bind to localhost
 // },
//});
