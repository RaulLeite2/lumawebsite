// ── Perlin Noise (classic 2D) ─────────────────────────────────────────────────
const Perlin = (() => {
    const perm = new Uint8Array(512);
    const grad = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
    function seed(s) {
        const p = new Uint8Array(256);
        for (let i=0;i<256;i++) p[i]=i;
        let r = s || 1337;
        for (let i=255;i>0;i--) {
            r = (r * 1664525 + 1013904223) & 0xffffffff;
            const j = (r >>> 0) % (i+1);
            [p[i],p[j]] = [p[j],p[i]];
        }
        for (let i=0;i<512;i++) perm[i]=p[i&255];
    }
    const fade = t => t*t*t*(t*(t*6-15)+10);
    const lerp  = (a,b,t) => a + t*(b-a);
    const dot2  = (g,[gx,gy],x,y) => gx*x + gy*y;
    function noise(x, y) {
        const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
        const xf = x - Math.floor(x), yf = y - Math.floor(y);
        const u = fade(xf), v = fade(yf);
        const aa=perm[perm[xi]+yi], ab=perm[perm[xi]+yi+1];
        const ba=perm[perm[xi+1]+yi], bb=perm[perm[xi+1]+yi+1];
        return lerp(
            lerp(dot2(aa, grad[aa & 7], xf,   yf  ), dot2(ba, grad[ba & 7], xf-1, yf  ), u),
            lerp(dot2(ab, grad[ab & 7], xf,   yf-1), dot2(bb, grad[bb & 7], xf-1, yf-1), u),
            v
        );
    }
    function fbm(x, y, oct=6, lac=2.0, gain=0.5) {
        let v=0, a=1, f=1, max=0;
        for (let i=0;i<oct;i++) { v += a*noise(x*f, y*f); max+=a; a*=gain; f*=lac; }
        return v/max;
    }
    return { seed, noise, fbm };
})();

// ── Isometric helpers ─────────────────────────────────────────────────────────
// Grid cell (gx, gy) → screen (sx, sy), with elevation lift
function isoProject(gx, gy, elev, tileW, tileH, originX, originY) {
    const sx = originX + (gx - gy) * (tileW / 2);
    const sy = originY + (gx + gy) * (tileH / 2) - elev;
    return [sx, sy];
}

// ── Map data ──────────────────────────────────────────────────────────────────
const MAP_TEMPLATES = [
    {
        id: 0,
        name: "Valoria Crown",
        sub: "⚔ Coração imperial sob tensão constante",
        seed: 42,
        primeTime: { declareHour: 18, startHour: 19, endHour: 21 },
        atmosphere: { mode: 'embers', glow: 'rgba(126, 92, 255, 0.16)', fogColor: '255, 202, 150', particleColor: '255, 180, 112' },
        palette: {
            low:  { base:'#1c1005', side:'#110a03', path:'rgba(100,60,10,0.5)'  },
            mid:  { base:'#2e1d08', side:'#1a0f04'                              },
            high: { base:'#3d2a0a', side:'#251608'                              },
            water:{ base:'#0d1a2a', side:'#091221'                              },
        },
        resources: [
            { gx:4,  gy:3,  icon:'🪨', tier:'T3' },
            { gx:9,  gy:3,  icon:'🪵', tier:'T4' },
            { gx:10, gy:8,  icon:'🌿', tier:'T3' },
            { gx:3,  gy:8,  icon:'⛏',  tier:'T4' },
            { gx:7,  gy:7,  icon:'🐾', tier:'T2' },
        ],
        territories: [
            { id:1, glyph:'✦', featured:true, name:'Valoria', gx:7, gy:6,  r:1.12, owner:'LumaGuard', ownerDisplay:'✦ Casa Luma', defense:4, coins:1200, color:'#8e4dff' },
            { id:2, glyph:'⬡', name:'Porta Seraph', gx:7, gy:2,  r:0.86, owner:null, defense:1, coins:100, color:'#2a2a4b' },
            { id:3, glyph:'☽', name:'Muralha Vesper', gx:11, gy:6, r:0.88, owner:'DarkOrder', ownerDisplay:'☽ Ordem Umbral', defense:3, coins:640, color:'#ff6d7a' },
            { id:4, glyph:'✶', name:'Vau Myren', gx:3, gy:6,  r:0.86, owner:null, defense:1, coins:100, color:'#2a2a4b' },
            { id:5, glyph:'◈', name:'Claustro Solari', gx:7, gy:10, r:0.86, owner:'GuildAlpha', ownerDisplay:'✶ Vanguarda Alpha', defense:2, coins:380, color:'#5865f2' },
        ],
        exits: [
            { gx:7, gy:0,  dir:'N', target:1 },
            { gx:13,gy:6,  dir:'E', target:2 },
            { gx:7, gy:13, dir:'S', target:3 },
            { gx:0, gy:6,  dir:'W', target:4 },
        ],
        playerCount: 67,
        hudResources: [
            { icon:'🪨', tier:'T III' }, { icon:'🪵', tier:'T IV' },
            { icon:'🌿', tier:'T III' }, { icon:'⛏', tier:'T II-IV' },
            { icon:'🐾', tier:'T II' },
        ],
    },
    {
        id: 1,
        name: 'Ashveil Bastion',
        sub: '🛡 Mata de vigília e guerra de atrito',
        seed: 99,
        primeTime: { declareHour: 19, startHour: 20, endHour: 22 },
        atmosphere: { mode: 'spores', glow: 'rgba(77, 180, 122, 0.18)', fogColor: '180, 235, 198', particleColor: '138, 255, 186' },
        palette: {
            low:  { base:'#0d1a0e', side:'#071009', path:'rgba(30,90,20,0.4)'  },
            mid:  { base:'#163818', side:'#0d2410'                              },
            high: { base:'#1f5020', side:'#132f14'                              },
            water:{ base:'#091221', side:'#050c16'                              },
        },
        resources: [
            { gx:5, gy:4, icon:'🌿', tier:'T5' },
            { gx:9, gy:2, icon:'🪵', tier:'T5' },
            { gx:11, gy:9, icon:'🪨', tier:'T4' },
            { gx:3, gy:9, icon:'🌾', tier:'T3' },
        ],
        territories: [
            { id:10, glyph:'⬢', name:'Trono Esmeral', gx:7, gy:5, r:1.08, owner:'GreenPact', ownerDisplay:'⬢ Pacto Esmeral', defense:3, coins:900, color:'#47d7ac' },
            { id:11, glyph:'✧', name:'Flecha do Norte', gx:7, gy:2, r:0.85, owner:null, defense:1, coins:100, color:'#2a2a4b' },
            { id:12, glyph:'✶', name:'Terraço Viridian', gx:11, gy:6, r:0.85, owner:'GreenPact', ownerDisplay:'⬢ Pacto Esmeral', defense:2, coins:450, color:'#47d7ac' },
            { id:13, glyph:'☽', name:'Bosque da Ferrugem', gx:3, gy:6, r:0.85, owner:'DarkOrder', ownerDisplay:'☽ Ordem Umbral', defense:3, coins:560, color:'#ff6d7a' },
        ],
        exits: [
            { gx:7, gy:0, dir:'N', target:null },
            { gx:13, gy:6, dir:'E', target:2 },
            { gx:7, gy:13, dir:'S', target:0 },
            { gx:0, gy:6, dir:'W', target:null },
        ],
        playerCount: 34,
        hudResources: [
            { icon:'🌿', tier:'T V' }, { icon:'🪵', tier:'T V' },
            { icon:'🪨', tier:'T IV' }, { icon:'🌾', tier:'T III' },
        ],
    },
    {
        id: 2,
        name: 'Nhal-Kor Scar',
        sub: '💀 Falha vulcânica aberta pelo caos',
        seed: 777,
        primeTime: { declareHour: 20, startHour: 21, endHour: 23 },
        atmosphere: { mode: 'ash', glow: 'rgba(255, 110, 71, 0.16)', fogColor: '190, 150, 145', particleColor: '255, 134, 88' },
        palette: {
            low:  { base:'#1a0a0a', side:'#100505', path:'rgba(120,40,10,0.45)' },
            mid:  { base:'#2d1010', side:'#1c0808'                               },
            high: { base:'#3f1818', side:'#281010'                               },
            water:{ base:'#100505', side:'#0a0303'                               },
        },
        resources: [
            { gx:4, gy:4, icon:'⛏', tier:'T5' },
            { gx:9, gy:3, icon:'🪨', tier:'T6' },
            { gx:10, gy:9, icon:'💎', tier:'T6' },
            { gx:3, gy:8, icon:'🦴', tier:'T4' },
        ],
        territories: [
            { id:20, glyph:'◉', name:'Forja de Nhal-Kor', gx:7, gy:6, r:1.1, owner:null, defense:1, coins:100, color:'#2a2a4b' },
            { id:21, glyph:'☽', name:'Sepulcro Carbono', gx:4, gy:9, r:0.86, owner:'DarkOrder', ownerDisplay:'☽ Ordem Umbral', defense:5, coins:2000, color:'#ff6d7a' },
            { id:22, glyph:'⬡', name:'Espiral Suturada', gx:10, gy:3, r:0.86, owner:null, defense:1, coins:100, color:'#2a2a4b' },
            { id:23, glyph:'✷', name:'Pilar Magma-Sul', gx:10, gy:9, r:0.82, owner:'GuildAlpha', ownerDisplay:'✶ Vanguarda Alpha', defense:2, coins:520, color:'#5865f2' },
        ],
        exits: [
            { gx:7, gy:0, dir:'N', target:null },
            { gx:13, gy:6, dir:'E', target:null },
            { gx:7, gy:13, dir:'S', target:4 },
            { gx:0, gy:6, dir:'W', target:0 },
        ],
        playerCount: 12,
        hudResources: [
            { icon:'⛏', tier:'T V' }, { icon:'🪨', tier:'T VI' },
            { icon:'💎', tier:'T VI' }, { icon:'🦴', tier:'T IV' },
        ],
    },
    {
        id: 3,
        name: 'Myriath Bloom',
        sub: '🌸 Pântano luminoso e defesa orgânica',
        seed: 314,
        primeTime: { declareHour: 17, startHour: 18, endHour: 20 },
        atmosphere: { mode: 'fireflies', glow: 'rgba(110, 200, 255, 0.15)', fogColor: '170, 224, 255', particleColor: '255, 240, 140' },
        palette: {
            low:  { base:'#122019', side:'#09120d', path:'rgba(80,140,90,0.42)' },
            mid:  { base:'#224233', side:'#132a1f'                               },
            high: { base:'#31614c', side:'#1d382b'                               },
            water:{ base:'#112338', side:'#0b1624'                               },
        },
        resources: [
            { gx:4, gy:4, icon:'🪷', tier:'T4' },
            { gx:9, gy:4, icon:'🌿', tier:'T5' },
            { gx:11, gy:8, icon:'🐚', tier:'T4' },
            { gx:2, gy:9, icon:'🧪', tier:'T5' },
        ],
        territories: [
            { id:30, glyph:'✧', name:'Jardim Doura-Noite', gx:7, gy:6, r:1.08, owner:'GreenPact', ownerDisplay:'⬢ Pacto Esmeral', defense:4, coins:980, color:'#47d7ac' },
            { id:31, glyph:'◈', name:'Ancoradouro Sussurro', gx:7, gy:2, r:0.84, owner:null, defense:1, coins:100, color:'#2a2a4b' },
            { id:32, glyph:'✦', name:'Arco Telúrico', gx:11, gy:6, r:0.84, owner:'LumaGuard', ownerDisplay:'✦ Casa Luma', defense:3, coins:670, color:'#8e4dff' },
            { id:33, glyph:'☽', name:'Campina Hollowmere', gx:3, gy:7, r:0.84, owner:null, defense:1, coins:100, color:'#2a2a4b' },
        ],
        exits: [
            { gx:7, gy:0, dir:'N', target:0 },
            { gx:13, gy:6, dir:'E', target:null },
            { gx:7, gy:13, dir:'S', target:null },
            { gx:0, gy:6, dir:'W', target:4 },
        ],
        playerCount: 41,
        hudResources: [
            { icon:'🪷', tier:'T IV' }, { icon:'🌿', tier:'T V' },
            { icon:'🐚', tier:'T IV' }, { icon:'🧪', tier:'T V' },
        ],
    },
    {
        id: 4,
        name: 'Astreon Shelf',
        sub: '❄ Platô astral cortado por gelo azul',
        seed: 512,
        primeTime: { declareHour: 16, startHour: 17, endHour: 19 },
        atmosphere: { mode: 'snow', glow: 'rgba(126, 190, 255, 0.16)', fogColor: '220, 238, 255', particleColor: '235, 244, 255' },
        palette: {
            low:  { base:'#18253a', side:'#0f1625', path:'rgba(110,150,220,0.42)' },
            mid:  { base:'#24405f', side:'#162842'                               },
            high: { base:'#355c89', side:'#213858'                               },
            water:{ base:'#0a1730', side:'#07101f'                               },
        },
        resources: [
            { gx:4, gy:3, icon:'🧊', tier:'T5' },
            { gx:9, gy:3, icon:'💠', tier:'T6' },
            { gx:10, gy:8, icon:'🪨', tier:'T4' },
            { gx:3, gy:8, icon:'🐺', tier:'T5' },
        ],
        territories: [
            { id:40, glyph:'✹', name:'Astreon Spire', gx:7, gy:6, r:1.08, owner:'LumaGuard', ownerDisplay:'✦ Casa Luma', defense:4, coins:1400, color:'#8e4dff' },
            { id:41, glyph:'⬢', name:'Ponte Rimefall', gx:7, gy:2, r:0.84, owner:null, defense:1, coins:100, color:'#2a2a4b' },
            { id:42, glyph:'☽', name:'Fenda Bluewake', gx:11, gy:6, r:0.84, owner:'DarkOrder', ownerDisplay:'☽ Ordem Umbral', defense:4, coins:840, color:'#ff6d7a' },
            { id:43, glyph:'✶', name:'Bastilha Celsia', gx:3, gy:6, r:0.84, owner:'GreenPact', ownerDisplay:'⬢ Pacto Esmeral', defense:2, coins:420, color:'#47d7ac' },
        ],
        exits: [
            { gx:7, gy:0, dir:'N', target:2 },
            { gx:13, gy:6, dir:'E', target:0 },
            { gx:7, gy:13, dir:'S', target:null },
            { gx:0, gy:6, dir:'W', target:3 },
        ],
        playerCount: 29,
        hudResources: [
            { icon:'🧊', tier:'T V' }, { icon:'💠', tier:'T VI' },
            { icon:'🪨', tier:'T IV' }, { icon:'🐺', tier:'T V' },
        ],
    },
];

const TOTAL_MAPS = 48;

function twoHourPrimeWindow(index) {
    const slot = index % 12;
    const startHour = slot * 2;
    const endHourRaw = startHour + 2;
    const endHour = endHourRaw >= 24 ? 23 : endHourRaw;
    const endMinute = endHourRaw >= 24 ? 59 : 0;
    return { startHour, endHour, endMinute };
}

function buildExpandedMaps(templates, totalMaps) {
    const maps = [];
    for (let i = 0; i < totalMaps; i += 1) {
        const template = templates[i % templates.length];
        const clone = JSON.parse(JSON.stringify(template));
        const window = twoHourPrimeWindow(i);
        clone.id = i;
        clone.seed = Number(clone.seed || 0) + (i * 137);
        clone.name = `${clone.name} ${String(i + 1).padStart(2, '0')}`;
        clone.sub = `⚔ Prime ${String(window.startHour).padStart(2, '0')}:00-${String(window.endHour).padStart(2, '0')}:${String(window.endMinute).padStart(2, '0')}`;
        clone.primeTime = {
            declareHour: window.startHour,
            startHour: window.startHour,
            endHour: window.endHour,
            endMinute: window.endMinute,
        };

        clone.exits = [
            { gx: 7, gy: 0, dir: 'N', target: (i + 1) % totalMaps },
            { gx: 13, gy: 6, dir: 'E', target: (i + 2) % totalMaps },
            { gx: 7, gy: 13, dir: 'S', target: (i - 1 + totalMaps) % totalMaps },
            { gx: 0, gy: 6, dir: 'W', target: (i - 2 + totalMaps) % totalMaps },
        ];
        clone.playerCount = Math.max(8, Number(clone.playerCount || 20) + ((i % 7) - 3));
        maps.push(clone);
    }
    return maps;
}

function buildAtlasMap(realMaps) {
    const atlasSlots = [];
    const gridPoints = [1, 3, 5, 7, 9, 11, 13];
    let cursor = 0;

    for (const gy of gridPoints) {
        for (const gx of gridPoints) {
            if (gx === 7 && gy === 7) {
                continue;
            }
            const targetIndex = cursor + 1;
            const targetMap = realMaps[cursor];
            if (!targetMap) {
                continue;
            }
            atlasSlots.push({
                id: `atlas-${cursor}`,
                gx,
                gy,
                label: String(cursor + 1).padStart(2, '0'),
                name: targetMap.name,
                targetIndex,
                primeTime: targetMap.primeTime,
            });
            cursor += 1;
        }
    }

    return {
        id: 'atlas',
        name: 'Atlas da Capital',
        sub: '👑 Visão total das 48 regiões • Capital no centro',
        seed: 2026,
        primeTime: { declareHour: 0, startHour: 0, endHour: 23, endMinute: 59 },
        atmosphere: { mode: 'fireflies', glow: 'rgba(255, 214, 122, 0.12)', fogColor: '188, 192, 255', particleColor: '255, 232, 175' },
        palette: {
            low:  { base:'#141a2c', side:'#0c111f', path:'rgba(112,128,188,0.28)' },
            mid:  { base:'#1e2944', side:'#131a2e' },
            high: { base:'#28355b', side:'#18203b' },
            water:{ base:'#0a1020', side:'#060b15' },
        },
        resources: [],
        territories: [],
        exits: [],
        cities: [],
        atlasNodes: atlasSlots,
        atlasCapital: { gx: 7, gy: 7, name: 'Capital Luma' },
        playerCount: 48,
        hudResources: [
            { icon:'👑', quality:'Capital' },
            { icon:'🗺', quality:'48 mapas' },
            { icon:'⏳', quality:'24h ciclo' },
        ],
    };
}

const REAL_MAPS = buildExpandedMaps(MAP_TEMPLATES, TOTAL_MAPS);
const MAPS = [buildAtlasMap(REAL_MAPS), ...REAL_MAPS];

// ── Renderer ──────────────────────────────────────────────────────────────────
const GRID = 14;
const TILE_W = 64;
const TILE_H = 32;
const ELEV_SCALE = 28;

class MapRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');
        this.heightMap = null;
        this.mapDef    = null;
        this._time = 0;
        this._signals = [];
        // Pre-computed per tile: screen x/y of top vertex
        this._tileCache = [];
    }

    load(mapDef) {
        this.mapDef = mapDef;
        Perlin.seed(mapDef.seed);
        this.heightMap = this._buildHeightMap();
        this._tileCache = [];
        this.draw();
    }

    _buildHeightMap() {
        const hm = [];
        for (let gy = 0; gy < GRID; gy++) {
            hm[gy] = [];
            for (let gx = 0; gx < GRID; gx++) {
                // multiple octaves + edge falloff for diamond shape
                let n = Perlin.fbm(gx * 0.18, gy * 0.18, 6);
                // normalize to [0,1]
                n = (n + 1) / 2;
                // edge falloff  — diamond mask
                const cx = (gx - GRID/2 + 0.5) / (GRID/2);
                const cy = (gy - GRID/2 + 0.5) / (GRID/2);
                const dist = Math.abs(cx) + Math.abs(cy); // diamond distance
                const falloff = Math.max(0, 1 - dist * 0.85);
                n *= falloff;
                hm[gy][gx] = n;
            }
        }
        return hm;
    }

    _origin() {
        const w = this.canvas.width, h = this.canvas.height;
        return [w / 2, h * 0.28];
    }

    _tilePos(gx, gy) {
        const [ox, oy] = this._origin();
        const h = this.heightMap[gy]?.[gx] ?? 0;
        const elev = h * ELEV_SCALE;
        return isoProject(gx, gy, elev, TILE_W, TILE_H, ox, oy);
    }

    draw(time = performance.now()) {
        const c = this.ctx;
        const w = this.canvas.width, h = this.canvas.height;
        this._time = time * 0.001;

        c.clearRect(0, 0, w, h);

        // Deep sky background
        const bg = c.createRadialGradient(w*.5, 0, 0, w*.5, h*.5, h);
        bg.addColorStop(0,   '#12102a');
        bg.addColorStop(1,   '#07061a');
        c.fillStyle = bg;
        c.fillRect(0, 0, w, h);

        this._drawBackdropGlow();

        // Draw tiles back-to-front (painter's algorithm)
        for (let gy = 0; gy < GRID; gy++) {
            for (let gx = 0; gx < GRID; gx++) {
                this._drawTile(gx, gy);
            }
        }

        this._drawResources();
        this._drawCities();
        this._drawPaths();
        this._drawFog();
        this._drawAtlasOverview();
        this._drawFactionAssaultTrails();
        this._drawTerritories();
        this._drawActionSignals();
        this._drawExits();
        this._drawAmbientParticles();
        this._drawCardinals();
        this._drawVignette();
    }

    _tileColor(h) {
        const pal = this.mapDef.palette;
        if (h < 0.08) return pal.water;
        if (h < 0.35) return pal.low;
        if (h < 0.65) return pal.mid;
        return pal.high;
    }

    _drawTile(gx, gy) {
        const c   = this.ctx;
        const hv  = this.heightMap[gy][gx];
        const col = this._tileColor(hv);
        const [sx, sy] = this._tilePos(gx, gy);
        const tw = TILE_W / 2, th = TILE_H / 2;

        // top face — diamond
        c.beginPath();
        c.moveTo(sx,      sy      );   // top
        c.lineTo(sx + tw, sy + th );   // right
        c.lineTo(sx,      sy + th*2);  // bottom
        c.lineTo(sx - tw, sy + th );   // left
        c.closePath();

        // subtle lighting: slightly brighter on top
        const lightFactor = 0.85 + hv * 0.3;
        c.fillStyle = col.base;
        c.fill();

        const variation = Perlin.fbm(gx * 0.41 + 8.1, gy * 0.41 + 3.4, 3, 2.1, 0.56);
        const shimmer = 0.025 + Math.max(0, variation) * 0.08 + hv * 0.03;
        c.fillStyle = `rgba(255,255,255,${shimmer})`;
        c.fill();

        c.beginPath();
        c.moveTo(sx, sy + 1);
        c.lineTo(sx + tw * 0.92, sy + th * 0.92);
        c.strokeStyle = `rgba(255,255,255,${0.04 + hv * 0.08})`;
        c.lineWidth = 1;
        c.stroke();

        if (variation < -0.08) {
            c.beginPath();
            c.moveTo(sx - tw * 0.78, sy + th * 1.08);
            c.lineTo(sx + tw * 0.1, sy + th * 1.78);
            c.strokeStyle = `rgba(0,0,0,${0.05 + Math.abs(variation) * 0.08})`;
            c.lineWidth = 1;
            c.stroke();
        }

        // left face (west shadow)
        const sideH = Math.max(4, hv * ELEV_SCALE * 0.55);
        c.beginPath();
        c.moveTo(sx - tw, sy + th);
        c.lineTo(sx,      sy + th*2);
        c.lineTo(sx,      sy + th*2 + sideH);
        c.lineTo(sx - tw, sy + th  + sideH);
        c.closePath();
        c.fillStyle = col.side;
        c.fill();

        // right face (east shadow — darker)
        c.beginPath();
        c.moveTo(sx + tw, sy + th);
        c.lineTo(sx,      sy + th*2);
        c.lineTo(sx,      sy + th*2 + sideH);
        c.lineTo(sx + tw, sy + th  + sideH);
        c.closePath();
        // darken right side more
        c.fillStyle = this._darken(col.side, 0.72);
        c.fill();

        c.beginPath();
        c.moveTo(sx + tw, sy + th);
        c.lineTo(sx, sy + th * 2);
        c.strokeStyle = `rgba(0,0,0,${0.12 + hv * 0.08})`;
        c.lineWidth = 1.1;
        c.stroke();

        // subtle edge
        c.strokeStyle = 'rgba(0,0,0,0.18)';
        c.lineWidth = 0.5;
        c.beginPath();
        c.moveTo(sx,      sy      );
        c.lineTo(sx + tw, sy + th );
        c.lineTo(sx,      sy + th*2);
        c.lineTo(sx - tw, sy + th );
        c.closePath();
        c.stroke();
    }

    _darken(cssColor, factor) {
        // parse simple hex or rgba
        const m = cssColor.match(/rgba?\((\d+),(\d+),(\d+)/);
        if (m) {
            return `rgba(${Math.round(m[1]*factor)},${Math.round(m[2]*factor)},${Math.round(m[3]*factor)},1)`;
        }
        // hex
        const hex = cssColor.replace('#','');
        const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
        return `rgb(${Math.round(r*factor)},${Math.round(g*factor)},${Math.round(b*factor)})`;
    }

    _screenTerritoryCenter(t) {
        return this._tilePos(t.gx, t.gy);
    }

    setSignals(signals) {
        this._signals = Array.isArray(signals) ? signals : [];
    }

    _territoryMarker(t) {
        const marks = ['✦', '◈', '✶', '⬡', '✹', '✷', '◉'];
        if (t.glyph) {
            return t.glyph;
        }
        if (/valoria/i.test(t.name || '')) {
            return '✦';
        }
        return marks[Math.abs(Number(t.id || 0)) % marks.length];
    }

    _territoryRelation(t) {
        if (t.relation) {
            return t.relation;
        }
        return t.owner ? 'enemy' : 'neutral';
    }

    _territoryAura(t) {
        const relation = this._territoryRelation(t);
        if (relation === 'mine') {
            return {
                edge: '#63f0c5',
                core: 'rgba(99, 240, 197, 0.34)',
                ring: 'rgba(244, 196, 48, 0.68)',
            };
        }
        if (relation === 'enemy') {
            return {
                edge: '#7f8cff',
                core: 'rgba(123, 91, 255, 0.34)',
                ring: 'rgba(102, 163, 255, 0.56)',
            };
        }
        return {
            edge: t.color || '#5865f2',
            core: 'rgba(142, 77, 255, 0.18)',
            ring: 'rgba(255, 255, 255, 0.18)',
        };
    }

    _isFeaturedTerritory(t) {
        return this._selected === t.id || t.featured || /valoria/i.test(t.name || '');
    }

    _drawPaths() {
        const c = this.ctx;
        const pal = this.mapDef.palette;
        const center = this.mapDef.territories[0];
        const [cx, cy] = this._screenTerritoryCenter(center);
        const pulse = 0.75 + Math.sin(this._time * 1.4) * 0.08;

        c.save();
        c.strokeStyle = pal.low.path || 'rgba(120,80,20,0.45)';
        c.lineWidth = 1.8;
        c.setLineDash([5, 4]);
        this.mapDef.territories.slice(1).forEach(t => {
            const [tx, ty] = this._screenTerritoryCenter(t);
            c.beginPath();
            c.moveTo(cx, cy);
            c.lineTo(tx, ty);
            c.stroke();
        });
        c.setLineDash([]);

        c.strokeStyle = `rgba(255, 214, 122, ${0.08 + pulse * 0.05})`;
        c.lineWidth = 4.5;
        c.filter = 'blur(5px)';
        this.mapDef.territories.slice(1).forEach(t => {
            const [tx, ty] = this._screenTerritoryCenter(t);
            c.beginPath();
            c.moveTo(cx, cy);
            c.lineTo(tx, ty);
            c.stroke();
        });
        c.filter = 'none';
        c.restore();
    }

    _drawResources() {
        const c = this.ctx;
        this.mapDef.resources.forEach(r => {
            const [sx, sy] = this._tilePos(r.gx, r.gy);
            const cx = sx, cy = sy + TILE_H / 2 - 4;

            c.beginPath();
            c.arc(cx, cy, 11, 0, Math.PI * 2);
            c.fillStyle = 'rgba(10,6,2,0.88)';
            c.fill();
            c.strokeStyle = 'rgba(180,110,15,0.6)';
            c.lineWidth = 1.3;
            c.stroke();

            c.font = '9px serif';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillStyle = '#fff';
            c.fillText(r.icon, cx, cy - 1);

            c.font = 'bold 6px "Plus Jakarta Sans", sans-serif';
            c.fillStyle = '#f4c430';
            c.fillText(this._resourceLabel(r), cx, cy + 8);
        });
    }

    _resourceLabel(resource) {
        if (resource.quality) {
            return resource.quality;
        }
        const tier = String(resource.tier || '').toUpperCase();
        if (tier.includes('VI') || tier.includes('6')) return 'Lend.';
        if (tier.includes('V') || tier.includes('5')) return 'Epica';
        if (tier.includes('IV') || tier.includes('4')) return 'Rara';
        if (tier.includes('III') || tier.includes('3')) return 'Incom.';
        return 'Comum';
    }

    _cityList() {
        const cities = Array.isArray(this.mapDef.cities) && this.mapDef.cities.length
            ? [...this.mapDef.cities]
            : [
            { id: `city-${this.mapDef.id}-a`, name: 'Cidade Mercantil', gx: 2, gy: 2, taxRate: 0.08 },
            { id: `city-${this.mapDef.id}-b`, name: 'Porto de Trocas', gx: 11, gy: 10, taxRate: 0.12 },
        ];

        cities.push({
            id: `league-hall-${this.mapDef.id}`,
            name: 'Liga',
            gx: 7,
            gy: 1,
            taxRate: 0,
            kind: 'league',
        });

        return cities;
    }

    _drawCities() {
        const c = this.ctx;
        this._cityList().forEach((city) => {
            const [sx, sy] = this._tilePos(city.gx, city.gy);
            const cx = sx;
            const cy = sy + TILE_H * 0.35;
            const isLeague = city.kind === 'league';
            const icon = isLeague ? '🏆' : '🏙';

            c.save();
            c.beginPath();
            c.arc(cx, cy, isLeague ? 14 : 13, 0, Math.PI * 2);
            c.fillStyle = 'rgba(16, 23, 48, 0.82)';
            c.fill();
            c.strokeStyle = isLeague ? 'rgba(244, 196, 48, 0.92)' : 'rgba(136, 192, 255, 0.9)';
            c.lineWidth = isLeague ? 2.1 : 1.6;
            c.stroke();

            c.font = '12px "Plus Jakarta Sans", sans-serif';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillStyle = '#f7fbff';
            c.fillText(icon, cx, cy);

            c.font = '700 9px "Plus Jakarta Sans", sans-serif';
            c.fillStyle = isLeague ? '#f4c430' : '#9fc3ff';
            c.fillText(city.name, cx, cy + 20);
            c.restore();
        });
    }

    _drawFactionAssaultTrails() {
        const c = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const active = this.mapDef.territories.filter((territory) => territory.factionAttackActive);
        if (!active.length) {
            return;
        }

        active.forEach((territory) => {
            const [tx, ty] = this._screenTerritoryCenter(territory);
            const lane = Math.abs(Number(territory.id || 0)) % 4;
            let sx = -40;
            let sy = h * 0.2;
            if (lane === 1) {
                sx = w + 40;
                sy = h * 0.28;
            } else if (lane === 2) {
                sx = w * 0.18;
                sy = h + 40;
            } else if (lane === 3) {
                sx = w * 0.84;
                sy = -40;
            }

            c.save();
            c.lineWidth = 2.8;
            c.setLineDash([10, 7]);
            c.lineDashOffset = -this._time * 26;
            c.strokeStyle = 'rgba(255, 86, 104, 0.72)';
            c.shadowColor = 'rgba(255, 70, 90, 0.62)';
            c.shadowBlur = 16;
            c.beginPath();
            c.moveTo(sx, sy);
            c.quadraticCurveTo((sx + tx) * 0.5, Math.min(sy, ty) - 28, tx, ty);
            c.stroke();

            c.setLineDash([]);
            c.shadowBlur = 0;
            c.globalAlpha = 0.48;
            c.strokeStyle = 'rgba(255, 176, 186, 0.58)';
            c.lineWidth = 1.3;
            c.beginPath();
            c.moveTo(sx, sy);
            c.quadraticCurveTo((sx + tx) * 0.5, Math.min(sy, ty) - 18, tx, ty);
            c.stroke();
            c.restore();
        });
    }

    _drawAtlasOverview() {
        if (!Array.isArray(this.mapDef.atlasNodes) || !this.mapDef.atlasNodes.length) {
            return;
        }

        const c = this.ctx;
        const capital = this.mapDef.atlasCapital;
        if (capital) {
            const [sx, sy] = this._tilePos(capital.gx, capital.gy);
            const cx = sx;
            const cy = sy + TILE_H * 0.32;
            c.save();
            const glow = c.createRadialGradient(cx, cy, 10, cx, cy, 48);
            glow.addColorStop(0, 'rgba(255, 223, 132, 0.54)');
            glow.addColorStop(1, 'rgba(255, 223, 132, 0)');
            c.fillStyle = glow;
            c.beginPath();
            c.arc(cx, cy, 48, 0, Math.PI * 2);
            c.fill();

            c.beginPath();
            c.arc(cx, cy, 18, 0, Math.PI * 2);
            c.fillStyle = 'rgba(21, 18, 42, 0.96)';
            c.fill();
            c.strokeStyle = 'rgba(255, 214, 122, 0.95)';
            c.lineWidth = 2.2;
            c.stroke();
            c.font = '14px "Plus Jakarta Sans", sans-serif';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillStyle = '#fff2ba';
            c.fillText('👑', cx, cy);
            c.font = '700 11px "Plus Jakarta Sans", sans-serif';
            c.fillStyle = '#ffe08e';
            c.fillText(capital.name, cx, cy + 24);
            c.restore();
        }

        this.mapDef.atlasNodes.forEach((node) => {
            const [sx, sy] = this._tilePos(node.gx, node.gy);
            const cx = sx;
            const cy = sy + TILE_H * 0.3;

            c.save();
            c.beginPath();
            c.arc(cx, cy, 10, 0, Math.PI * 2);
            c.fillStyle = 'rgba(18, 24, 48, 0.92)';
            c.fill();
            c.strokeStyle = 'rgba(124, 192, 255, 0.88)';
            c.lineWidth = 1.4;
            c.stroke();

            c.font = '700 8px "Plus Jakarta Sans", sans-serif';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillStyle = '#e8f4ff';
            c.fillText(node.label, cx, cy);

            c.font = '700 8px "Plus Jakarta Sans", sans-serif';
            c.fillStyle = '#8fd0ff';
            c.fillText(node.name.replace(/\s\d+$/, ''), cx, cy + 16);
            c.restore();
        });
    }

    _drawTerritories() {
        const c = this.ctx;
        const w = this.canvas.width;
        const r_base = w * 0.0165;
        const cityKeys = new Set(this._cityList().map(ct => `${ct.gx},${ct.gy}`));

        this.mapDef.territories.forEach(t => {
            if (cityKeys.has(`${t.gx},${t.gy}`)) return;
            const [sx, sy] = this._screenTerritoryCenter(t);
            const r = r_base * t.r;
            const active = this._hovered === t.id || this._selected === t.id;
            const featured = this._isFeaturedTerritory(t);
            const aura = this._territoryAura(t);
            const pulse = 1 + Math.sin(this._time * (featured ? 2.6 : 1.3) + t.id * 0.7) * (featured ? 0.06 : 0.025);
            const sc = (active ? 1.09 : 1.0) * pulse;

            c.save();
            c.translate(sx, sy);
            c.scale(sc, sc);

            if (t.owner) {
                const glowRadius = r * (featured ? 2.1 : 1.55);
                const glow = c.createRadialGradient(0,0,r*.2, 0,0,glowRadius);
                glow.addColorStop(0, aura.core);
                glow.addColorStop(0.58, `${t.color}55`);
                glow.addColorStop(1, t.color + '00');
                c.beginPath();
                c.arc(0, 0, glowRadius, 0, Math.PI*2);
                c.fillStyle = glow;
                c.fill();
            }

            if (featured) {
                c.save();
                c.rotate(this._time * 0.42);
                c.strokeStyle = aura.ring;
                c.lineWidth = 1.8;
                c.setLineDash([6, 6]);
                c.beginPath();
                c.arc(0, 0, r * 1.32, 0, Math.PI * 2);
                c.stroke();
                c.restore();
            }

            if (t.attackDeclared) {
                c.save();
                c.rotate(-this._time * 0.55);
                c.strokeStyle = 'rgba(255, 170, 86, 0.92)';
                c.lineWidth = 1.5;
                c.setLineDash([4, 4]);
                c.beginPath();
                c.arc(0, 0, r * 1.48, 0, Math.PI * 2);
                c.stroke();
                c.restore();
            }

            if (t.factionAttackActive) {
                const siegePulse = 1 + (Math.sin(this._time * 5.4 + Number(t.id || 0)) * 0.09);
                c.save();
                c.rotate(this._time * 0.42);
                c.strokeStyle = 'rgba(255, 74, 94, 0.95)';
                c.lineWidth = 1.9;
                c.setLineDash([5, 4]);
                c.beginPath();
                c.arc(0, 0, r * 1.62 * siegePulse, 0, Math.PI * 2);
                c.stroke();
                c.restore();

                c.save();
                c.strokeStyle = 'rgba(255, 130, 140, 0.6)';
                c.lineWidth = 1.3;
                c.beginPath();
                c.arc(0, 0, r * 1.22, 0, Math.PI * 2);
                c.stroke();
                c.restore();
            }

            const bg = c.createRadialGradient(-r*.2,-r*.2,0, 0,0,r);
            bg.addColorStop(0, aura.edge + 'ee');
            bg.addColorStop(0.45, t.color + 'cc');
            bg.addColorStop(1, t.color + '44');
            c.beginPath();
            c.arc(0, 0, r, 0, Math.PI*2);
            c.fillStyle = bg;
            c.fill();

            c.strokeStyle = this._selected === t.id ? '#fff' : (t.owner ? aura.edge : '#3a3a6a');
            c.lineWidth = this._selected === t.id ? 2.3 : (featured ? 1.8 : 1.2);
            c.stroke();

            c.shadowColor = featured ? aura.edge : 'transparent';
            c.shadowBlur = featured ? 8 : 0;
            c.font = `${r*.42}px "Plus Jakarta Sans", sans-serif`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillStyle = '#f7f8ff';
            c.fillText(this._territoryMarker(t), 0, -r*.12);

            c.font = `bold ${r*.21}px "Plus Jakarta Sans",sans-serif`;
            c.fillStyle = '#fff';
            c.fillText(`Lv ${t.defense}`, 0, r*.38);
            c.shadowBlur = 0;

            c.restore();

            const fs = Math.max(6, w * .0095);
            c.textAlign = 'center';
            c.textBaseline = 'top';
            c.shadowColor = 'rgba(0,0,0,0.95)';
            c.shadowBlur = 5;

            c.font = `700 ${fs}px "Plus Jakarta Sans",sans-serif`;
            c.fillStyle = '#f1f2ff';
            c.fillText(t.name, sx, sy + r*sc + 4);

            if (t.owner) {
                c.font = `${fs*.85}px "Plus Jakarta Sans",sans-serif`;
                c.fillStyle = aura.edge;
                c.fillText(t.ownerDisplay || t.owner, sx, sy + r*sc + 4 + fs + 2);
            }
            c.shadowBlur = 0;
        });
    }

    _drawBackdropGlow() {
        const c = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const pulse = 0.12 + Math.sin(this._time * 0.8) * 0.03;
        const atmosphere = this.mapDef.atmosphere || {};

        c.save();
        c.fillStyle = atmosphere.glow || `rgba(84, 95, 180, ${pulse})`;
        c.beginPath();
        c.ellipse(w * 0.52, h * 0.24, w * 0.32, h * 0.18, 0, 0, Math.PI * 2);
        c.fill();

        c.fillStyle = atmosphere.overlay || 'rgba(23, 15, 42, 0.22)';
        c.fillRect(0, 0, w, h);
        c.restore();
    }

    _drawFog() {
        const c = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const atmosphere = this.mapDef.atmosphere || {};
        const fogColor = atmosphere.fogColor || '168, 196, 255';
        const density = atmosphere.mode === 'ash' ? 5 : 4;

        c.save();
        c.globalCompositeOperation = 'screen';
        for (let i = 0; i < density; i += 1) {
            const drift = ((this._time * (8 + i * 2)) + i * 80) % (w + 260);
            const x = drift - 130;
            const y = h * (0.34 + i * 0.1) + Math.sin(this._time * 0.55 + i) * 18;
            const grad = c.createRadialGradient(x, y, 18, x, y, 150 + i * 24);
            grad.addColorStop(0, `rgba(${fogColor}, ${0.05 - i * 0.006})`);
            grad.addColorStop(1, `rgba(${fogColor}, 0)`);
            c.fillStyle = grad;
            c.beginPath();
            c.ellipse(x, y, 180 + i * 24, 54 + i * 10, -0.12, 0, Math.PI * 2);
            c.fill();
        }
        c.restore();
    }

    _drawAmbientParticles() {
        const c = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const atmosphere = this.mapDef.atmosphere || {};
        const mode = atmosphere.mode || 'snow';
        const particleColor = atmosphere.particleColor || '255,255,255';

        c.save();
        for (let i = 0; i < 30; i += 1) {
            const x = (i * 57 + this._time * (10 + (i % 5) * 4)) % w;
            const flow = mode === 'embers' ? -1 : 1;
            const y = (i * 37 + Math.sin(this._time * 0.8 + i) * 22 + h * 0.18 + this._time * flow * (mode === 'embers' ? 18 : 6)) % h;
            const alpha = 0.05 + (Math.sin(this._time * 1.8 + i) + 1) * 0.03;
            const radius = mode === 'embers' ? 1.6 : (mode === 'fireflies' ? 1.8 : 1.25);
            c.fillStyle = `rgba(${particleColor},${alpha})`;
            c.beginPath();
            c.arc(x, y, radius + (i % 3) * 0.35, 0, Math.PI * 2);
            c.fill();
        }
        c.restore();
    }

    _drawVignette() {
        const c = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const vignette = c.createRadialGradient(w * 0.5, h * 0.48, h * 0.12, w * 0.5, h * 0.5, h * 0.74);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(0.72, 'rgba(0,0,0,0.14)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.42)');
        c.fillStyle = vignette;
        c.fillRect(0, 0, w, h);
    }

    _drawActionSignals() {
        const c = this.ctx;
        const now = performance.now();
        const activeSignals = this._signals.filter((signal) => (now - signal.createdAt) < signal.duration);

        activeSignals.forEach((signal) => {
            const territory = this.mapDef.territories.find((slot) => Number(slot.id) === Number(signal.territoryId));
            if (!territory) {
                return;
            }

            const [sx, sy] = this._screenTerritoryCenter(territory);
            const progress = (now - signal.createdAt) / signal.duration;
            const rise = progress * 34;
            const alpha = 1 - progress;
            const palette = {
                declare: '255, 174, 92',
                attack: '255, 106, 122',
                defend: '88, 228, 176',
                claim: '255, 228, 129',
                collect: '255, 212, 98',
            };
            const color = palette[signal.type] || '255,255,255';

            c.save();
            c.globalAlpha = alpha;
            c.strokeStyle = `rgba(${color}, ${0.7 * alpha})`;
            c.lineWidth = 2;
            c.beginPath();
            c.arc(sx, sy, 20 + progress * 22, 0, Math.PI * 2);
            c.stroke();

            c.font = '700 12px "Plus Jakarta Sans", sans-serif';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.shadowColor = `rgba(${color}, ${0.65 * alpha})`;
            c.shadowBlur = 14;
            c.fillStyle = `rgba(255,255,255,${alpha})`;
            c.fillText(signal.label, sx, sy - 34 - rise);
            c.restore();
        });
    }

    _drawExits() {
        const c = this.ctx;
        const angles = { N:-90, E:0, S:90, W:180 };
        this.mapDef.exits.forEach(e => {
            const [sx, sy] = this._tilePos(e.gx, e.gy);
            const cx = sx, cy = sy + TILE_H/2 - 2;

            const grd = c.createRadialGradient(cx, cy, 0, cx, cy, 20);
            grd.addColorStop(0, 'rgba(244,196,48,0.4)');
            grd.addColorStop(1, 'rgba(244,196,48,0)');
            c.beginPath();
            c.arc(cx, cy, 20, 0, Math.PI*2);
            c.fillStyle = grd;
            c.fill();

            c.save();
            c.translate(cx, cy);
            c.rotate(angles[e.dir] * Math.PI / 180);
            c.beginPath();
            c.moveTo(12, 0);
            c.lineTo(-7, -7);
            c.lineTo(-4, 0);
            c.lineTo(-7, 7);
            c.closePath();
            c.fillStyle = '#f4c430';
            c.shadowColor = '#f4c430';
            c.shadowBlur = 12;
            c.fill();
            c.shadowBlur = 0;
            c.restore();
        });
    }

    _drawCardinals() {
        const c = this.ctx;
        const w = this.canvas.width, h = this.canvas.height;
        const fs = w * .018;
        const dirs = [
            { l:'N', x:w*.5,  y:h*.04 },
            { l:'S', x:w*.5,  y:h*.96 },
            { l:'W', x:w*.04, y:h*.5  },
            { l:'E', x:w*.96, y:h*.5  },
        ];
        c.font = `700 ${fs}px "Plus Jakarta Sans",sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = 'rgba(255,255,255,0.25)';
        dirs.forEach(d => c.fillText(d.l, d.x, d.y));
    }

    // ── Hit test ──
    hitTerritory(mx, my) {
        const w = this.canvas.width;
        const r_base = w * 0.0165;
        const cityKeys = new Set(this._cityList().map(ct => `${ct.gx},${ct.gy}`));
        for (const t of this.mapDef.territories) {
            if (cityKeys.has(`${t.gx},${t.gy}`)) continue;
            const [sx, sy] = this._screenTerritoryCenter(t);
            const r = r_base * t.r * 1.12;
            const dx = mx - sx, dy = my - sy;
            if (dx*dx + dy*dy <= r*r) return t;
        }
        return null;
    }

    hitExit(mx, my) {
        for (const e of this.mapDef.exits) {
            const [sx, sy] = this._tilePos(e.gx, e.gy);
            const cx = sx, cy = sy + TILE_H/2 - 2;
            const dx = mx - cx, dy = my - cy;
            if (dx*dx + dy*dy <= 22*22) return e;
        }
        return null;
    }

    hitAtlasNode(mx, my) {
        if (!Array.isArray(this.mapDef.atlasNodes) || !this.mapDef.atlasNodes.length) {
            return null;
        }
        for (const node of this.mapDef.atlasNodes) {
            const [sx, sy] = this._tilePos(node.gx, node.gy);
            const cx = sx;
            const cy = sy + TILE_H * 0.3;
            const dx = mx - cx;
            const dy = my - cy;
            if ((dx * dx) + (dy * dy) <= (12 * 12)) {
                return node;
            }
        }
        return null;
    }

    hitResource(mx, my) {
        for (const r of this.mapDef.resources) {
            const [sx, sy] = this._tilePos(r.gx, r.gy);
            const cx = sx;
            const cy = sy + TILE_H / 2 - 4;
            const dx = mx - cx;
            const dy = my - cy;
            if (dx * dx + dy * dy <= 14 * 14) {
                return r;
            }
        }
        return null;
    }

    hitCity(mx, my) {
        for (const city of this._cityList()) {
            const [sx, sy] = this._tilePos(city.gx, city.gy);
            const cx = sx;
            const cy = sy + TILE_H * 0.35;
            const dx = mx - cx;
            const dy = my - cy;
            if (dx * dx + dy * dy <= 15 * 15) {
                return city;
            }
        }
        return null;
    }

    setHovered(id)  { this._hovered  = id; }
    setSelected(id) { this._selected = id; }

    resize(w, h) {
        this.canvas.width  = w;
        this.canvas.height = h;
        if (this.mapDef) this.draw();
    }
}

// ── Export ────────────────────────────────────────────────────────────────────
window.MapRenderer = MapRenderer;
window.MAPS = MAPS;
