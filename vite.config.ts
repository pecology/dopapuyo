import { defineConfig } from 'vite';

// GitHub Pages のサブパス（/<repo>/）でも動くよう相対パスで出力する
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
});
