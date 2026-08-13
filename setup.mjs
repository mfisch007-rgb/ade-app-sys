import fs from 'fs'; import path from 'path';  
const coreDir = path.join(process.cwd(), 'src', 'core');  
const pubDir = path.join(process.cwd(), 'public');  
if (!fs.existsSync(coreDir)) fs.mkdirSync(coreDir, { recursive: true });  
if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });  
