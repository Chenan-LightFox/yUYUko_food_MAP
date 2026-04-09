const fs = require('fs');

const files = [
    'src/admin/AdminUsers.jsx',
    'src/admin/AdminComments.jsx',
    'src/admin/AdminGeneralUsers.jsx',
    'src/admin/AdminInvitecodes.jsx',
    'src/admin/AdminPlaces.jsx'
];

for (const f of files) {
    let content = fs.readFileSync(f, 'utf8');

    // Substitute the Tips import
    content = content.replace(
        /import Tips from [\"\']\.\.\/components\/Tips[\"\'];/g,
        'import { useTips } from "../components/Tips";'
    );

    // Replace the state definition with useTips()
    content = content.replace(
        /const \[message,\s*setMessage\]\s*=\s*useState\(['"]{0,2}\);\r?\n/g,
        'const showTip = useTips();\n'
    );

    // Replace setMessage calls
    content = content.replace(/setMessage\(/g, 'showTip(');

    // Remove the previously added inline Tips rendering component
    content = content.replace(/\{message && <Tips[^>]+\/>\}\r?\n?/g, '');

    // Also remove the old inline divs just in case any remained
    content = content.replace(/\{message && <div[^>]+>\{message\}<\/div>\}\r?\n?/g, '');

    fs.writeFileSync(f, content);
}

console.log("Transformation complete!");
