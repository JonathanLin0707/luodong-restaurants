jest.mock('../src/placesClient');
jest.mock('../src/cache');

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

const cache = require('../src/cache');
cache.load.mockReturnValue(null);

describe('frontend static serving', () => {
  const originalDistEnv = process.env.FRONTEND_DIST_DIR;
  let tmpDistDir;

  afterEach(() => {
    if (tmpDistDir) {
      fs.rmSync(tmpDistDir, { recursive: true, force: true });
      tmpDistDir = undefined;
    }
    if (originalDistEnv === undefined) {
      delete process.env.FRONTEND_DIST_DIR;
    } else {
      process.env.FRONTEND_DIST_DIR = originalDistEnv;
    }
    jest.resetModules();
  });

  it('serves index.html for a non-API GET route when the frontend build exists', async () => {
    tmpDistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luodong-dist-'));
    fs.writeFileSync(path.join(tmpDistDir, 'index.html'), '<html><body>built-frontend</body></html>');
    process.env.FRONTEND_DIST_DIR = tmpDistDir;

    jest.resetModules();
    const app = require('../src/app');

    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('built-frontend');
  });

  it('returns JSON 404 for an unknown /api route even when the frontend build exists', async () => {
    tmpDistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luodong-dist-'));
    fs.writeFileSync(path.join(tmpDistDir, 'index.html'), '<html><body>built-frontend</body></html>');
    process.env.FRONTEND_DIST_DIR = tmpDistDir;

    jest.resetModules();
    const app = require('../src/app');

    const res = await request(app).get('/api/unknown');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it('does not crash and still answers JSON 404 for /api/unknown when there is no frontend build', async () => {
    process.env.FRONTEND_DIST_DIR = path.join(os.tmpdir(), 'luodong-dist-does-not-exist');

    jest.resetModules();
    const app = require('../src/app');

    const apiRes = await request(app).get('/api/unknown');
    expect(apiRes.status).toBe(404);
    expect(apiRes.body.error).toBeDefined();

    const rootRes = await request(app).get('/');
    expect(rootRes.status).toBe(404);
  });

  describe('PWA 檔案', () => {
    function makePwaDist() {
      tmpDistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luodong-dist-'));
      fs.writeFileSync(path.join(tmpDistDir, 'index.html'), '<html><body>built-frontend</body></html>');
      fs.writeFileSync(path.join(tmpDistDir, 'sw.js'), "const VERSION = 'test';");
      fs.writeFileSync(path.join(tmpDistDir, 'manifest.webmanifest'), JSON.stringify({ name: '附近餐廳推薦' }));
      fs.mkdirSync(path.join(tmpDistDir, 'assets'));
      fs.writeFileSync(path.join(tmpDistDir, 'assets', 'index-abc123.js'), 'console.log(1);');
      process.env.FRONTEND_DIST_DIR = tmpDistDir;
      jest.resetModules();
      return require('../src/app');
    }

    it('sw.js 以 JavaScript 送出且 Cache-Control: no-cache', async () => {
      const app = makePwaDist();
      const res = await request(app).get('/sw.js');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/javascript/);
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.text).toContain("VERSION = 'test'");
    });

    it('manifest.webmanifest 的 MIME 是 application/manifest+json 且 no-cache', async () => {
      const app = makePwaDist();
      const res = await request(app).get('/manifest.webmanifest');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^application\/manifest\+json/);
      expect(res.headers['cache-control']).toBe('no-cache');
    });

    it('/assets/* 帶長期快取標頭', async () => {
      const app = makePwaDist();
      const res = await request(app).get('/assets/index-abc123.js');
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    });

    it('不存在且帶副檔名的路徑回 404，不回 index.html', async () => {
      const app = makePwaDist();
      for (const url of ['/not-exist.png', '/assets/old-hash.js', '/icons/nope.png']) {
        const res = await request(app).get(url);
        expect(res.status).toBe(404);
        expect(res.text).not.toContain('built-frontend');
      }
    });

    it('/ 與沒有副檔名的前端路由仍回 index.html', async () => {
      const app = makePwaDist();
      for (const url of ['/', '/?location=luodong&radius=1000', '/some/client/route']) {
        const res = await request(app).get(url);
        expect(res.status).toBe(200);
        expect(res.text).toContain('built-frontend');
      }
    });
  });
});
