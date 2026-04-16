import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const functionsDir = path.join(rootDir, 'functions');
const distFunctionsDir = path.join(rootDir, 'dist', 'functions');

function copyFunctions() {
  if (!fs.existsSync(functionsDir)) {
    console.log('functions directory not found, skipping copy');
    return;
  }

  fs.mkdirSync(distFunctionsDir, { recursive: true });

  const files = fs.readdirSync(functionsDir);
  
  for (const file of files) {
    const srcPath = path.join(functionsDir, file);
    const destPath = path.join(distFunctionsDir, file);
    
    if (fs.statSync(srcPath).isFile()) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied: ${file}`);
    }
  }

  console.log('Functions copied successfully!');
}

copyFunctions();
