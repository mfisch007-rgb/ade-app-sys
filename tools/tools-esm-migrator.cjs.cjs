const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "src");

function processFile(filePath) {
  let code = fs.readFileSync(filePath, "utf8");

  // dotenv
  code = code.replace(
    /require\(['"]dotenv['"]\)\.config\(\);?/g,
    'import "dotenv/config";'
  );

  // const x = require(...)
  code = code.replace(
    /const\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\)/g,
    (match, varName, modPath) => {

      if (
        !modPath.startsWith(".") &&
        !modPath.startsWith("/")
      ) {
        return `import ${varName} from "${modPath}";`;
      }

      return `import ${varName} from "${modPath}.js";`;
    }
  );

  // const { x } = require(...)
  code = code.replace(
    /const\s+\{\s*([^}]+)\s*\}\s*=\s*require\(['"]([^'"]+)['"]\)/g,
    (match, imports, modPath) => {

      if (
        !modPath.startsWith(".") &&
        !modPath.startsWith("/")
      ) {
        return `import { ${imports} } from "${modPath}";`;
      }

      return `import { ${imports} } from "${modPath}.js";`;
    }
  );

  // remove duplicate .js.js
  code = code.replace(/\.js\.js/g, ".js");

  // exports
  code = code.replace(
    /module\.exports\s*=\s*(\w+);?/g,
    'export default $1;'
  );

  code = code.replace(
    /module\.exports\s*=\s*\{([^}]+)\};?/g,
    'export { $1 };'
  );

  fs.writeFileSync(filePath, code, "utf8");

  console.log("✅ Fixed:", filePath);
}

function walk(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const full = path.join(dir, file);

    if (fs.statSync(full).isDirectory()) {
      walk(full);
    } else if (file.endsWith(".js")) {
      processFile(full);
    }
  }
}

walk(SRC_DIR);

console.log("\n🚀 ESM migration complete.");