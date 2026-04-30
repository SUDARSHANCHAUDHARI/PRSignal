import { cp, copyFile, mkdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await copyFile('src/content.css', 'dist/content.css');
