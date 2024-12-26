/**
 * example package.json entry: 
 * "prebuild": "node ./node_modules/@iobroker/adapter-dev/bin/clean-dir.js ./build",
*/
const fs = require('fs');

const dirPath = process.argv[ 2 ];

if (!dirPath) {
    console.error('Please provide a directory to clean.');
    process.exit(1);
}
if (fs.existsSync(dirPath)) {
    fs.rm(dirPath, { recursive: true }, (err) => {
        if (err) {
            console.error(`Error while deleting ${dirPath}.`, err);
        } else {
            console.log(`${dirPath} is deleted.`);
        }
    });
} else {
    console.log(`${dirPath} does not exist.`);
}