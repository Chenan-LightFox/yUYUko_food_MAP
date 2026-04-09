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

    // Remove `showTip("");` and `showTip('');`
    content = content.replace(/[ \t]*showTip\(['"]['"]\);\r?\n?/g, '');

    fs.writeFileSync(f, content);
}

console.log("Empty tips removed!");
