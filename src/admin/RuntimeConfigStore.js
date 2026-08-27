import fs from 'fs'; import path from 'path';
export class RuntimeConfigStore {
  constructor(file=path.resolve('data/runtime-config/admin.json')) { this.file=file; fs.mkdirSync(path.dirname(file),{recursive:true}); if(!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({settings:{},ui:{},channels:{},policies:{}},null,2)); }
  read(){ try{return JSON.parse(fs.readFileSync(this.file,'utf8'));}catch{return {settings:{},ui:{},channels:{},policies:{}};} }
  write(section,key,value){ const d=this.read(); d[section]=d[section]||{}; d[section][key]=value; fs.writeFileSync(this.file,JSON.stringify(d,null,2)); return d; }
}
