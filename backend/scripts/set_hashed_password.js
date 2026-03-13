const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const dbFile = path.join(__dirname, '..', 'data.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error('Failed to open DB:', err.message);
        process.exit(1);
    }
});

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
        function(err) {
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
