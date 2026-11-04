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
});
