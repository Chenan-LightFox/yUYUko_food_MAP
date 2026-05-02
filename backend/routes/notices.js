const express = require('express');
const router = express.Router();
const { db } = require('../db');

router.get('/current', (req, res) => {
    db.get(
        'SELECT id, title, content, color_key, created_by, created_time FROM SiteNotice WHERE is_active = 1 ORDER BY created_time DESC, id DESC LIMIT 1',
        [],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ notice: row || null });
        }
    );
});

module.exports = router;