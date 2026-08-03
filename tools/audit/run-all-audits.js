import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

function walk(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    fs.readdirSync(dir).forEach(file => {
        if (['node_modules', '.git', 'dist', '.next', '.vscode', 'coverage', 'reports'].includes(file)) return;
        const p = path.join(dir, file);
        if (fs.statSync(p).isDirectory()) results = results.concat(walk(p));
        else results.push(p);
    });
    return results;
}

export function runMasterAudit() {
    const files = walk(ROOT).filter(f => f.endsWith('.js') || f.endsWith('.jsx'));
    console.log(`[ENTERPRISE AUDIT SUITE] Scanning ${files.length} active JavaScript modules...`);
    
    let deadEvents = [];
    let emptyCatches = [];
    let unawaitedPublishes = [];
    let missingPinRoutes = [];
    
    const published = new Set();
    const subscribed = new Set();

    files.forEach(file => {
        const rel = path.relative(ROOT, file);
        const code = fs.readFileSync(file, 'utf8');
        const lines = code.split('\n');

        lines.forEach((line, idx) => {
            const lineNum = idx + 1;
            
            // Track Events
            const pub = line.match(/publish\(\s*["']([^"']+)["']/);
            if (pub) {
                published.add(pub[1]);
                if (!/await/.test(line) && !/return/.test(line) && !/then/.test(line)) {
                    unawaitedPublishes.push(`${rel}:${lineNum}`);
                }
            }
            const sub = line.match(/subscribe\(\s*["']([^"']+)["']/);
            if (sub) subscribed.add(sub[1]);

            // Track Empty Catches
            if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line) || /catch\s*\{\s*\}/.test(line)) {
                emptyCatches.push(`${rel}:${lineNum}`);
            }

            // Track Unprotected POST Routes
            if (/app\.post|router\.post/i.test(line) && !/X-Security-PIN|verifyPin|authMiddleware/i.test(line)) {
                if (!rel.includes('test') && !rel.includes('audit')) {
                    missingPinRoutes.push(`${rel}:${lineNum}`);
                }
            }
        });
    });

    const dead = Array.from(published).filter(t => !subscribed.has(t) && t !== '*');

    console.log('\n==================================================');
    console.log('         MODULAR ENTERPRISE AUDIT METRICS         ');
    console.log('==================================================');
    console.log(`Un-awaited Event Publishes : ${unawaitedPublishes.length}`);
    console.log(`Empty Catch Blocks         : ${emptyCatches.length}`);
    console.log(`Unprotected POST Routes    : ${missingPinRoutes.length}`);
    console.log(`Dead Bus Events            : ${dead.length}`);
    console.log('==================================================\n');
    
    return {
        unawaitedCount: unawaitedPublishes.length,
        emptyCatchCount: emptyCatches.length,
        unprotectedRoutesCount: missingPinRoutes.length,
        deadEventsCount: dead.length
    };
}

runMasterAudit();