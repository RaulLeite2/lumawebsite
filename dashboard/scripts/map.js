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
const MAPS = [
    {
        id: 0,
        name: "Smoothfloor Cleft",
        sub: "⚔ Zona de combate livre",
        seed: 42,
        palette: {
            low:  { base:'#1c1005', side:'#110a03', path:'rgba(100,60,10,0.5)'  },
            mid:  { base:'#2e1d08', side:'#1a0f04'                              },
            high: { base:'#3d2a0a', side:'#251608'                              },
            water:{ base:'#0d1a2a', side:'#091221'                              },
        },
        resources: [
            { gx:4,  gy:3,  icon:"🪨", tier:"T3" },
            { gx:9,  gy:3,  icon:"🪵", tier:"T4" },
            { gx:10, gy:8,  icon:"🌿", tier:"T3" },
            { gx:3,  gy:8,  icon:"⛏",  tier:"T4" },
            { gx:7,  gy:7,  icon:"🐾", tier:"T2" },
        ],
        territories: [
            { id:1, name:"Bastião Central", gx:7, gy:6,  r:1.1, owner:"LumaGuard",  defense:4, coins:1200, color:"#8e4dff" },
            { id:2, name:"Posto Norte",     gx:7, gy:2,  r:0.85,owner:null,          defense:1, coins:100,  color:"#2a2a4b" },
            { id:3, name:"Bastião Leste",   gx:11,gy:6,  r:0.85,owner:"DarkOrder",   defense:3, coins:640,  color:"#ff6d7a" },
            { id:4, name:"Ruínas Oeste",    gx:3, gy:6,  r:0.85,owner:null,          defense:1, coins:100,  color:"#2a2a4b" },
            { id:5, name:"Santuário Sul",   gx:7, gy:10, r:0.85,owner:"GuildAlpha",  defense:2, coins:380,  color:"#5865f2" },
        ],
        exits: [
            { gx:7, gy:0,  dir:"N", target:1 },
            { gx:13,gy:6,  dir:"E", target:2 },
            { gx:7, gy:13, dir:"S", target:3 },
            { gx:0, gy:6,  dir:"W", target:4 },
        ],
        playerCount: 67,
        hudResources: [
            { icon:"🪨", tier:"T III" }, { icon:"🪵", tier:"T IV" },
            { icon:"🌿", tier:"T III" }, { icon:"⛏",  tier:"T II-IV" },
            { icon:"🐾", tier:"T II"  },
        ],
    },
    {
        id: 1,
        name: "Ashveil Highlands",
        sub: "🛡 Zona de controle de guilda",
        seed: 99,
        palette: {
            low:  { base:'#0d1a0e', side:'#071009', path:'rgba(30,90,20,0.4)'  },
            mid:  { base:'#163818', side:'#0d2410'                              },
            high: { base:'#1f5020', side:'#132f14'                              },
            water:{ base:'#091221', side:'#050c16'                              },
        },
        resources: [
            { gx:5,  gy:4,  icon:"🌿", tier:"T5" },
            { gx:9,  gy:2,  icon:"🪵", tier:"T5" },
            { gx:11, gy:9,  icon:"🪨", tier:"T4" },
            { gx:3,  gy:9,  icon:"🌾", tier:"T3" },
        ],
        territories: [
            { id:10, name:"Torre Esmeralda", gx:7, gy:5,  r:1.1, owner:"GreenPact",  defense:3, coins:900,  color:"#47d7ac" },
            { id:11, name:"Vigia do Norte",  gx:7, gy:2,  r:0.85,owner:null,          defense:1, coins:100,  color:"#2a2a4b" },
            { id:12, name:"Colina Leste",    gx:11,gy:6,  r:0.85,owner:"GreenPact",   defense:2, coins:450,  color:"#47d7ac" },
            { id:13, name:"Ruínas Oeste",    gx:3, gy:6,  r:0.85,owner:"DarkOrder",   defense:3, coins:560,  color:"#ff6d7a" },
        ],
        exits: [
            { gx:7, gy:0,  dir:"N", target:null },
            { gx:13,gy:6,  dir:"E", target:null },
            { gx:7, gy:13, dir:"S", target:0    },
            { gx:0, gy:6,  dir:"W", target:null },
        ],
        playerCount: 34,
        hudResources: [
            { icon:"🌿", tier:"T V" }, { icon:"🪵", tier:"T V" },
            { icon:"🪨", tier:"T IV" }, { icon:"🌾", tier:"T III" },
        ],
    },
    {
        id: 2,
        name: "Cinderstone Wastes",
        sub: "💀 Terra de ninguém",
        seed: 777,
        palette: {
            low:  { base:'#1a0a0a', side:'#100505', path:'rgba(120,40,10,0.45)' },
            mid:  { base:'#2d1010', side:'#1c0808'                               },
            high: { base:'#3f1818', side:'#281010'                               },
            water:{ base:'#100505', side:'#0a0303'                               },
        },
        resources: [
            { gx:4, gy:4,  icon:"⛏",  tier:"T5" },
            { gx:9, gy:3,  icon:"🪨", tier:"T6" },
            { gx:10,gy:9,  icon:"💎", tier:"T6" },
            { gx:3, gy:8,  icon:"🦴", tier:"T4" },
        ],
        territories: [
            { id:20, name:"Fortaleza de Cinzas", gx:7, gy:6,  r:1.1, owner:null,        defense:1, coins:100,  color:"#2a2a4b" },
            { id:21, name:"Necrópole",           gx:4, gy:9,  r:0.85,owner:"DarkOrder",  defense:5, coins:2000, color:"#ff6d7a" },
            { id:22, name:"Espiral do Caos",     gx:10,gy:3,  r:0.85,owner:null,          defense:1, coins:100,  color:"#2a2a4b" },
        ],
        exits: [
            { gx:7, gy:0,  dir:"N", target:null },
            { gx:13,gy:6,  dir:"E", target:null },
            { gx:7, gy:13, dir:"S", target:null },
            { gx:0, gy:6,  dir:"W", target:0    },
        ],
        playerCount: 12,
        hudResources: [
            { icon:"⛏",  tier:"T V" }, { icon:"🪨", tier:"T VI" },
            { icon:"💎", tier:"T VI" }, { icon:"🦴", tier:"T IV" },
        ],
    },
];

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

    draw() {
        const c = this.ctx;
        const w = this.canvas.width, h = this.canvas.height;

        c.clearRect(0, 0, w, h);

        // Deep sky background
        const bg = c.createRadialGradient(w*.5, 0, 0, w*.5, h*.5, h);
        bg.addColorStop(0,   '#12102a');
        bg.addColorStop(1,   '#07061a');
        c.fillStyle = bg;
        c.fillRect(0, 0, w, h);

        // Draw tiles back-to-front (painter's algorithm)
        for (let gy = 0; gy < GRID; gy++) {
            for (let gx = 0; gx < GRID; gx++) {
                this._drawTile(gx, gy);
            }
        }

        this._drawResources();
        this._drawPaths();
        this._drawTerritories();
        this._drawExits();
        this._drawCardinals();
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

    _drawPaths() {
        const c = this.ctx;
        const pal = this.mapDef.palette;
        const center = this.mapDef.territories[0];
        const [cx, cy] = this._screenTerritoryCenter(center);

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
        c.restore();
    }

    _drawResources() {
        const c = this.ctx;
        this.mapDef.resources.forEach(r => {
            const [sx, sy] = this._tilePos(r.gx, r.gy);
            const cx = sx, cy = sy + TILE_H / 2 - 4;

            c.beginPath();
            c.arc(cx, cy, 14, 0, Math.PI * 2);
            c.fillStyle = 'rgba(10,6,2,0.88)';
            c.fill();
            c.strokeStyle = 'rgba(180,110,15,0.6)';
            c.lineWidth = 1.5;
            c.stroke();

            c.font = '11px serif';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillStyle = '#fff';
            c.fillText(r.icon, cx, cy - 1);

            c.font = 'bold 7px "Plus Jakarta Sans", sans-serif';
            c.fillStyle = '#f4c430';
            c.fillText(r.tier, cx, cy + 10);
        });
    }

    _drawTerritories() {
        const c = this.ctx;
        const w = this.canvas.width;
        const r_base = w * 0.038;

        this.mapDef.territories.forEach(t => {
            const [sx, sy] = this._screenTerritoryCenter(t);
            const r = r_base * t.r;
            const active = this._hovered === t.id || this._selected === t.id;
            const sc = active ? 1.09 : 1.0;

            c.save();
            c.translate(sx, sy);
            c.scale(sc, sc);

            if (t.owner) {
                const glow = c.createRadialGradient(0,0,r*.3, 0,0,r*1.8);
                glow.addColorStop(0, t.color + '40');
                glow.addColorStop(1, t.color + '00');
                c.beginPath();
                c.arc(0, 0, r*1.8, 0, Math.PI*2);
                c.fillStyle = glow;
                c.fill();
            }

            const bg = c.createRadialGradient(-r*.2,-r*.2,0, 0,0,r);
            bg.addColorStop(0, t.color + 'cc');
            bg.addColorStop(1, t.color + '44');
            c.beginPath();
            c.arc(0, 0, r, 0, Math.PI*2);
            c.fillStyle = bg;
            c.fill();

            c.strokeStyle = this._selected === t.id ? '#fff' : (t.owner ? t.color : '#3a3a6a');
            c.lineWidth = this._selected === t.id ? 3 : 1.5;
            c.stroke();

            c.font = `${r*.48}px serif`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText('🛡', 0, -r*.12);

            c.font = `bold ${r*.28}px "Plus Jakarta Sans",sans-serif`;
            c.fillStyle = '#fff';
            c.fillText(`Lv ${t.defense}`, 0, r*.38);

            c.restore();

            const fs = Math.max(9, w * .016);
            c.textAlign = 'center';
            c.textBaseline = 'top';
            c.shadowColor = 'rgba(0,0,0,0.95)';
            c.shadowBlur = 7;

            c.font = `700 ${fs}px "Plus Jakarta Sans",sans-serif`;
            c.fillStyle = '#f1f2ff';
            c.fillText(t.name, sx, sy + r*sc + 4);

            if (t.owner) {
                c.font = `${fs*.85}px "Plus Jakarta Sans",sans-serif`;
                c.fillStyle = t.color;
                c.fillText(t.owner, sx, sy + r*sc + 4 + fs + 2);
            }
            c.shadowBlur = 0;
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
        const fs = w * .022;
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
        const r_base = w * 0.038;
        for (const t of this.mapDef.territories) {
            const [sx, sy] = this._screenTerritoryCenter(t);
            const r = r_base * t.r * 1.2;
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
