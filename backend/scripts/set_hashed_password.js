const { db, init } = require('../db');
const crypto = require('crypto');

const userIdentifier = { username: 'dev' };
const plainPassword = '12345679';

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

const hashed = hashPassword(plainPassword);

init();

db.serialize(() => {
    db.run(
        'UPDATE User SET password = ? WHERE username = ?',
        [hashed, userIdentifier.username],
        function (err) {
            if (err) {
                console.error('Update failed:', err.message);
                process.exitCode = 2;
            } else {
                console.log(`Password updated for username=${userIdentifier.username}`);
                db.get('SELECT id, username, password, admin_level FROM User WHERE username = ?', [userIdentifier.username], (e, row) => {
                    if (e) {
                        console.error('Select failed:', e.message);
                    } else {
                        console.log('Row:', row);
                    }
                    db.close();
                });
            }
        }
    );
});
