const fs = require('node:fs');
if (process.argv.includes('--help')) { console.log(process.argv.includes('--bad-help')?'Interactive mode only':process.argv.includes('--modern')?'--print --prompt-file --permission-mode':'--print --prompt-file'); process.exit(); }
const file = process.argv[process.argv.indexOf('--prompt-file') + 1];
const prompt = fs.readFileSync(file, 'utf8');
if (prompt === 'WAIT') setInterval(() => {}, 1000);
else if (prompt === 'AUTH') { console.error('Authentication required: secret-token'); process.exitCode = 1; }
else if (prompt === 'TRUST') { console.error('Workspace trust required'); process.exitCode = 1; }
else if (prompt === 'ARGS') console.log(JSON.stringify(process.argv.slice(2)));
else if (prompt === 'BIG') console.log('x'.repeat(2 * 1024 * 1024 + 1));
else console.log('Reviewed: ' + prompt);
