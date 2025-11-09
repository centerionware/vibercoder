import fs from 'fs';
import path from 'path';
import { rootFiles } from './plugin-generator/templates/root/index.js';
import { androidFiles } from './plugin-generator/templates/android/index.js';
import { iosFiles } from './plugin-generator/templates/ios/index.js';

const log = (message) => console.log(`[Plugin Generator] ${message}`);
const projectRoot = process.cwd();
const pluginDir = path.resolve(projectRoot, 'native-plugins/aide-browser');

function writeFiles(baseDir, filesObject) {
    for (const [filePath, content] of Object.entries(filesObject)) {
        const fullPath = path.resolve(baseDir, filePath);
        const dirName = path.dirname(fullPath);
        if (!fs.existsSync(dirName)) {
            fs.mkdirSync(dirName, { recursive: true });
        }
        fs.writeFileSync(fullPath, content.trim(), 'utf8');
        log(`  ✓ Wrote ${filePath}`);
    }
}

log('Starting modular native plugin generation...');

if (fs.existsSync(pluginDir)) {
    log(`Cleaning existing plugin directory: ${pluginDir}`);
    fs.rmSync(pluginDir, { recursive: true, force: true });
}

log(`Creating plugin directory: ${pluginDir}`);
fs.mkdirSync(pluginDir, { recursive: true });


// Write all the files from the imported templates
writeFiles(pluginDir, rootFiles);
writeFiles(pluginDir, androidFiles);
writeFiles(pluginDir, iosFiles);

log('Embedded native browser plugin generated successfully from modular templates.');
