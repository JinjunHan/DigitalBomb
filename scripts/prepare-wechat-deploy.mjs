// Run after tsc --outDir temp/wechat-service --rootDir .; produces reviewable deployment input only.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const files={};
for(const path of ['server/index.js','server/service.js','assets/scripts/shared/wechat-flow.js'])files[path]=await readFile('temp/wechat-service/'+path,'utf8');
const packageData={target:'/www/wwwroot/digital-bomb-service',service:'digital-bomb.service',expected:{'server/index.js':'fa8824b8612cbd868e4caf59279d2e3b996320fb7cdea819e533de0388c2bb9f','server/service.js':'30b4ce338d10665ce3f65829ec583579bda3fa84c8c20c76e75c5dd50fd16e45'},files};
await writeFile('temp/wechat-service/release.json',JSON.stringify(packageData));
console.log(Object.fromEntries(Object.entries(files).map(([path,data])=>[path,createHash('sha256').update(data).digest('hex')])));
