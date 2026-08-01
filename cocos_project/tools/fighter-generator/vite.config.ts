import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  server: {
    port: 3000
  },
  plugins: [
    {
      name: 'save-glb-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url || '';

          // 1. パーツ一覧スキャン API
          if (req.method === 'GET' && url.startsWith('/api/list-parts')) {
            try {
              const partsDir = path.resolve(__dirname, 'public/parts');
              const categories = ['fuselage', 'nose', 'wings', 'engines', 'canopy', 'tails', 'weapons'];
              const result: Record<string, string[]> = {};

              if (!fs.existsSync(partsDir)) {
                fs.mkdirSync(partsDir, { recursive: true });
              }

              categories.forEach(cat => {
                const catDir = path.join(partsDir, cat);
                if (!fs.existsSync(catDir)) {
                  fs.mkdirSync(catDir, { recursive: true });
                }
                const files = fs.readdirSync(catDir)
                  .filter(f => f.endsWith('.glb'));
                result[cat] = files;
              });

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          // 2. パーツアセット個別保存 API
          if (req.method === 'POST' && url.startsWith('/api/save-part')) {
            const bodyChunks: Buffer[] = [];
            req.on('data', (chunk) => bodyChunks.push(chunk));
            req.on('end', () => {
              try {
                const data = Buffer.concat(bodyChunks);
                const category = req.headers['x-part-category'] as string;
                const fileName = req.headers['x-file-name'] as string;

                if (!category || !fileName) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'Missing headers x-part-category or x-file-name' }));
                  return;
                }

                const destDir = path.resolve(__dirname, `public/parts/${category}`);
                if (!fs.existsSync(destDir)) {
                  fs.mkdirSync(destDir, { recursive: true });
                }

                const filePath = path.join(destDir, fileName);
                fs.writeFileSync(filePath, data);
                console.log(`[SavePart] Saved dummy part to: ${filePath}`);

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, path: filePath }));
              } catch (err: any) {
                console.error(`[SavePart] Error saving part:`, err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }

          // 3. Cocos Creator 側へのGLB最終出力 API
          if (req.method === 'POST' && url.startsWith('/api/save-glb')) {
            const bodyChunks: Buffer[] = [];
            req.on('data', (chunk) => {
              bodyChunks.push(chunk);
            });

            req.on('end', () => {
              try {
                const data = Buffer.concat(bodyChunks);
                const fileName = req.headers['x-file-name'] || 'custom_fighter.glb';
                
                // Cocos Creator の assets/resources/Gltf フォルダへ書き出す
                const saveDir = path.resolve(__dirname, '../../assets/resources/Gltf');
                
                if (!fs.existsSync(saveDir)) {
                  fs.mkdirSync(saveDir, { recursive: true });
                }
                
                const filePath = path.join(saveDir, fileName as string);
                fs.writeFileSync(filePath, data);
                console.log(`[SaveGLB] Saved fighter to: ${filePath}`);
                
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ 
                  success: true, 
                  path: filePath,
                  relative: `assets/resources/Gltf/${fileName}`
                }));
              } catch (err: any) {
                console.error(`[SaveGLB] Error saving file:`, err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }

          next();
        });
      }
    }
  ]
});
