import fs from 'fs';
import path from 'path';

function walkDir(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDir(file));
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walkDir('./client/src');
let changedCount = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  content = content.replace(/text-\[8px\] px-2 py-1/g, 'text-xs px-3 py-1.5 rounded-sm font-bold');
  content = content.replace(/text-\[8px\]/g, 'text-xs');
  
  content = content.replace(/fontSize: 8/g, 'fontSize: 11');
  content = content.replace(/fontSize: 9/g, 'fontSize: 11');
  content = content.replace(/fontSize: 7/g, 'fontSize: 10');
  content = content.replace(/fontSize: 5/g, 'fontSize: 9');
  content = content.replace(/fontSize: 10/g, 'fontSize: 12');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    changedCount++;
    console.log(`Updated ${file}`);
  }
});

console.log(`\nUpdated ${changedCount} files.`);
