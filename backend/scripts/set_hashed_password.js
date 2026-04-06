const { db } = require('../db');
const crypto = require('crypto');

const userIdentifier = { id: 864, username: 'dev' };
const plainPassword = '12345679';

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

const hashed = hashPassword(plainPassword);

db.serialize(() => {
    db.run(
        'UPDATE User SET password = ? WHERE id = ? OR username = ?',
        [hashed, userIdentifier.id, userIdentifier.username],
        function (err) {
            if (err) {
                console.error('Update failed:', err.message);
                process.exitCode = 2;
            } else {
                console.log(`Password updated for user id=${userIdentifier.id} / username=${userIdentifier.username}`);
                db.get('SELECT id, username, password, admin_level FROM User WHERE id = ? OR username = ?', [userIdentifier.id, userIdentifier.username], (e, row) => {
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
